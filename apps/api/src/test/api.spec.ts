import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { BLANK_TEMPLATE } from '@atlas/shared';
import { AppModule } from '../app.module';
import {
  GOOGLE_OAUTH_CLIENT,
  type GoogleOAuthClientInterface,
  type GoogleUserProfile,
} from '../auth/google-oauth.client';
import { DATABASE_DIALECT, DatabaseService } from '../database/database.service';
import { runMigrations } from '../database/migrator';
import { seedReferenceArchitectures } from '../database/seed';
import { createPGliteDialect } from './pglite-dialect';

class MockGoogleOAuthClient implements GoogleOAuthClientInterface {
  private profiles = new Map<string, GoogleUserProfile>();

  registerCode(code: string, profile: GoogleUserProfile) {
    this.profiles.set(code, profile);
  }

  buildAuthorizationUrl(state: string): string {
    return `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForUser(code: string): Promise<GoogleUserProfile> {
    const profile = this.profiles.get(code);
    if (!profile) {
      throw new Error(`Unexpected test OAuth code: ${code}`);
    }
    return profile;
  }
}

describe('Atlas Infra API (Auth, Companies, Architectures, Access Control)', () => {
  let app: INestApplication;
  let dbService: DatabaseService;
  let closePg: () => Promise<void>;
  const mockGoogle = new MockGoogleOAuthClient();

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
    process.env.FRONTEND_URL = 'http://localhost:5173';
    process.env.COOKIE_SECURE = 'false';

    const pg = createPGliteDialect();
    closePg = pg.close;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE_DIALECT)
      .useValue(pg.dialect)
      .overrideProvider(GOOGLE_OAUTH_CLIENT)
      .useValue(mockGoogle)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();

    dbService = moduleRef.get(DatabaseService);
    await runMigrations(dbService.db);
    await seedReferenceArchitectures(dbService.db);
  });

  afterAll(async () => {
    await app.close();
    await closePg();
  });

  async function signInAs(code: string, profile: GoogleUserProfile) {
    mockGoogle.registerCode(code, profile);
    const agent = request.agent(app.getHttpServer());

    const start = await agent.get('/api/auth/google').expect(302);
    const location = new URL(start.headers.location as string);
    const state = location.searchParams.get('state')!;

    await agent
      .get('/api/auth/google/callback')
      .query({ code, state })
      .expect(302);

    const me = await agent.get('/api/auth/me').expect(200);
    return { agent, user: me.body.user as { id: string; email: string; name: string } };
  }

  it('seeds reference architectures and exposes them anonymously', async () => {
    const res = await request(app.getHttpServer()).get('/api/architectures').expect(200);
    const slugs = (res.body as Array<{ slug: string; permissions: { canEdit: boolean } }>).map(
      (a) => a.slug,
    );
    expect(slugs).toEqual(
      expect.arrayContaining([
        'web-evolution',
        'simple-web-app',
        'k8s-prod-cluster',
        'three-tier-network',
      ]),
    );
    for (const item of res.body as Array<{ permissions: { canEdit: boolean; canDelete: boolean } }>) {
      expect(item.permissions.canEdit).toBe(false);
      expect(item.permissions.canDelete).toBe(false);
    }

    const single = await request(app.getHttpServer())
      .get('/api/architectures/simple-web-app')
      .expect(200);
    expect(single.body.dslJson.id).toBe('simple-web-app');
    expect(single.body.yamlSource).toContain('id: simple-web-app');
  });

  it('rejects unauthenticated access to protected routes with 401 and executes Google OAuth cookie flow', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/companies').expect(401);
    await request(app.getHttpServer())
      .post('/api/architectures')
      .send({ yamlSource: BLANK_TEMPLATE })
      .expect(401);

    // Rejects mismatched OAuth state
    const badStart = await request(app.getHttpServer()).get('/api/auth/google').expect(302);
    expect(badStart.headers.location).toContain('accounts.google.com');

    const { agent, user } = await signInAs('code-alice', {
      googleId: 'google-alice',
      email: 'alice@example.com',
      name: 'Alice Architect',
      avatarUrl: 'https://example.com/alice.png',
    });

    expect(user.email).toBe('alice@example.com');

    // Test refresh endpoint and logout
    await agent.post('/api/auth/refresh').expect(200);
    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/auth/me').expect(401);
  });

  it('enforces company CRUD, member role permissions, and last-owner guard', async () => {
    const alice = await signInAs('code-alice-co', {
      googleId: 'google-alice',
      email: 'alice@example.com',
      name: 'Alice',
      avatarUrl: null,
    });
    const bob = await signInAs('code-bob-co', {
      googleId: 'google-bob',
      email: 'bob@example.com',
      name: 'Bob',
      avatarUrl: null,
    });
    const carol = await signInAs('code-carol-co', {
      googleId: 'google-carol',
      email: 'carol@example.com',
      name: 'Carol',
      avatarUrl: null,
    });

    // Alice creates company -> becomes owner & activeCompanyId updates
    const created = await alice.agent
      .post('/api/companies')
      .send({ name: 'Atlas Systems', description: 'Core infra team' })
      .expect(201);
    const companyId = created.body.id as string;
    expect(created.body.myRole).toBe('owner');

    const meAfter = await alice.agent.get('/api/auth/me').expect(200);
    expect(meAfter.body.user.activeCompanyId).toBe(companyId);

    // Add Bob as viewer, Carol as admin
    await alice.agent
      .post(`/api/companies/${companyId}/members`)
      .send({ email: 'bob@example.com', role: 'viewer' })
      .expect(201);

    await alice.agent
      .post(`/api/companies/${companyId}/members`)
      .send({ email: 'carol@example.com', role: 'admin' })
      .expect(201);

    // Viewer cannot view company details or update company
    await bob.agent.get(`/api/companies/${companyId}`).expect(403);
    await bob.agent
      .patch(`/api/companies/${companyId}`)
      .send({ name: 'Hacked Name' })
      .expect(403);

    // Admin can view details & update profile, but cannot delete company or modify owner
    await carol.agent.get(`/api/companies/${companyId}`).expect(200);
    await carol.agent
      .patch(`/api/companies/${companyId}`)
      .send({ description: 'Updated by Carol' })
      .expect(200);
    await carol.agent.delete(`/api/companies/${companyId}`).expect(403);
    await carol.agent
      .patch(`/api/companies/${companyId}/members/${alice.user.id}`)
      .send({ role: 'viewer' })
      .expect(403);

    // Cannot remove or demote last owner
    await alice.agent
      .patch(`/api/companies/${companyId}/members/${alice.user.id}`)
      .send({ role: 'admin' })
      .expect(400);
    await alice.agent
      .delete(`/api/companies/${companyId}/members/${alice.user.id}`)
      .expect(400);

    // Promote Bob to editor, then clean delete by owner
    await carol.agent
      .patch(`/api/companies/${companyId}/members/${bob.user.id}`)
      .send({ role: 'editor' })
      .expect(200);

    await alice.agent.delete(`/api/companies/${companyId}`).expect(200);
    await alice.agent.get(`/api/companies/${companyId}`).expect(404);
  });

  it('enforces architecture CRUD, server-side DSL validation, and company/personal access control', async () => {
    const owner = await signInAs('code-arch-owner', {
      googleId: 'google-arch-owner',
      email: 'owner@example.com',
      name: 'Owner',
      avatarUrl: null,
    });
    const editor = await signInAs('code-arch-editor', {
      googleId: 'google-arch-editor',
      email: 'editor@example.com',
      name: 'Editor',
      avatarUrl: null,
    });
    const viewer = await signInAs('code-arch-viewer', {
      googleId: 'google-arch-viewer',
      email: 'viewer@example.com',
      name: 'Viewer',
      avatarUrl: null,
    });
    const outsider = await signInAs('code-arch-outsider', {
      googleId: 'google-arch-outsider',
      email: 'outsider@example.com',
      name: 'Outsider',
      avatarUrl: null,
    });

    const co = await owner.agent
      .post('/api/companies')
      .send({ name: 'Platform Org' })
      .expect(201);
    const companyId = co.body.id as string;

    await owner.agent
      .post(`/api/companies/${companyId}/members`)
      .send({ email: 'editor@example.com', role: 'editor' })
      .expect(201);
    await owner.agent
      .post(`/api/companies/${companyId}/members`)
      .send({ email: 'viewer@example.com', role: 'viewer' })
      .expect(201);

    // Reject invalid YAML / DSL on server
    await owner.agent
      .post('/api/architectures')
      .send({ yamlSource: 'id: bad\nname: Bad\nnodes:\n  - { id: x, label: X, type: bogus, layer: services }\n' })
      .expect(400);

    // Viewer cannot create inside company
    await viewer.agent
      .post('/api/architectures')
      .send({ yamlSource: BLANK_TEMPLATE, companyId })
      .expect(403);

    // Editor creates private company architecture
    const createdCompanyArch = await editor.agent
      .post('/api/architectures')
      .send({
        title: 'Payments Core',
        companyId,
        isPublic: false,
        yamlSource: BLANK_TEMPLATE,
      })
      .expect(201);
    const compArchId = createdCompanyArch.body.id as string;
    expect(createdCompanyArch.body.permissions.canEdit).toBe(true);
    expect(createdCompanyArch.body.permissions.canDelete).toBe(false);

    // Viewer can read, cannot edit or delete
    const viewerRead = await viewer.agent.get(`/api/architectures/${compArchId}`).expect(200);
    expect(viewerRead.body.permissions.canEdit).toBe(false);
    await viewer.agent
      .patch(`/api/architectures/${compArchId}`)
      .send({ title: 'Viewer Edit' })
      .expect(403);
    await viewer.agent.delete(`/api/architectures/${compArchId}`).expect(403);

    // Outsider and anonymous cannot read private company architecture
    await request(app.getHttpServer()).get(`/api/architectures/${compArchId}`).expect(401);
    await outsider.agent.get(`/api/architectures/${compArchId}`).expect(403);

    // Editor can patch, cannot delete
    await editor.agent
      .patch(`/api/architectures/${compArchId}`)
      .send({ title: 'Payments Core v2' })
      .expect(200);
    await editor.agent.delete(`/api/architectures/${compArchId}`).expect(403);

    // Company owner can delete
    await owner.agent.delete(`/api/architectures/${compArchId}`).expect(200);

    // Cannot edit or delete built-in reference architecture
    const refRes = await owner.agent.get('/api/architectures/web-evolution').expect(200);
    await owner.agent
      .patch(`/api/architectures/${refRes.body.id}`)
      .send({ title: 'Mutated' })
      .expect(403);
    await owner.agent.delete(`/api/architectures/${refRes.body.id}`).expect(403);
  });
});

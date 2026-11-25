import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { yaml } from '@codemirror/lang-yaml';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { indentWithTab } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import type { Diagnostic } from '@atlas/shared';
import { useAtlasStore } from '../store/useAtlasStore';
import { atlasCompletion } from './completion';

export interface YamlEditorHandle {
  /** Replace the whole document (load, import, format). Not added to undo as typing. */
  replace: (text: string) => void;
  /**
   * Select a range and scroll it into view. `focus` moves keyboard focus into
   * the editor; canvas selections must not, or Delete would edit the text.
   */
  reveal: (from: number, to: number, focus?: boolean) => void;
  showDiagnostics: (diagnostics: Diagnostic[]) => void;
}

interface Props {
  initialText: string;
  onChange: (text: string) => void;
  readOnly?: boolean;
  ref?: Ref<YamlEditorHandle>;
}

const lightTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '12px',
      backgroundColor: '#FAF9F6',
      color: '#141518',
    },
    '.cm-scroller': {
      fontFamily: "'JetBrains Mono', 'SF Mono', Consolas, Menlo, monospace",
      lineHeight: '1.6',
    },
    '.cm-gutters': {
      backgroundColor: '#F3F2EE',
      borderRight: '1px solid #DFDDD6',
      color: '#8E9199',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(37, 99, 235, 0.05)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#EAE8E2',
      color: '#141518',
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(37, 99, 235, 0.16) !important',
    },
    '.cm-cursor': {
      borderLeftColor: '#2563EB',
    },
  },
  { dark: false },
);

const darkTheme = [
  oneDark,
  EditorView.theme(
    {
      '&': {
        height: '100%',
        fontSize: '12px',
        backgroundColor: '#101215',
        color: '#ECEEF2',
      },
      '.cm-scroller': {
        fontFamily: "'JetBrains Mono', 'SF Mono', Consolas, Menlo, monospace",
        lineHeight: '1.6',
      },
      '.cm-gutters': {
        backgroundColor: '#16181C',
        borderRight: '1px solid #2A2E37',
        color: '#6B7280',
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: '#1F232A',
        color: '#ECEEF2',
      },
      '.cm-selectionBackground, ::selection': {
        backgroundColor: 'rgba(59, 130, 246, 0.24) !important',
      },
      '.cm-cursor': {
        borderLeftColor: '#3B82F6',
      },
    },
    { dark: true },
  ),
];

export function YamlEditor({ initialText, onChange, readOnly = false, ref }: Props) {
  const theme = useAtlasStore((s) => s.theme);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const readOnlyComp = useRef(new Compartment());
  const themeComp = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const comp = readOnlyComp.current;
    const tComp = themeComp.current;
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initialText,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          yaml(),
          EditorView.lineWrapping,
          EditorState.languageData.of(() => [{ autocomplete: atlasCompletion }]),
          lintGutter(),
          tComp.of(theme === 'dark' ? darkTheme : lightTheme),
          comp.of(EditorState.readOnly.of(readOnly)),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // The editor is created once; later text arrives through the handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({
      effects: readOnlyComp.current.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({
      effects: themeComp.current.reconfigure(theme === 'dark' ? darkTheme : lightTheme),
    });
  }, [theme]);

  useImperativeHandle(ref, () => ({
    replace: (text) => {
      const v = view.current;
      if (!v) return;
      const old = v.state.doc.toString();
      if (old === text) return;
      // Replace only the span that differs, so the cursor and scroll position survive canvas edits.
      let start = 0;
      while (start < old.length && start < text.length && old[start] === text[start]) start++;
      let endOld = old.length;
      let endNew = text.length;
      while (endOld > start && endNew > start && old[endOld - 1] === text[endNew - 1]) {
        endOld--;
        endNew--;
      }
      v.dispatch({ changes: { from: start, to: endOld, insert: text.slice(start, endNew) } });
    },
    reveal: (from, to, focus = false) => {
      const v = view.current;
      if (!v) return;
      const len = v.state.doc.length;
      const a = Math.min(from, len);
      const b = Math.min(to, len);
      v.dispatch({
        selection: { anchor: a, head: b },
        effects: EditorView.scrollIntoView(a, { y: 'center' }),
      });
      if (focus) v.focus();
    },
    showDiagnostics: (diagnostics) => {
      const v = view.current;
      if (!v) return;
      // Diagnostics come from a debounced parse; clamp in case the text moved on.
      const len = v.state.doc.length;
      const clamped = diagnostics.map((d) => ({
        from: Math.min(d.from, len),
        to: Math.min(d.to, len),
        severity: d.severity,
        message: d.message,
      }));
      v.dispatch(setDiagnostics(v.state, clamped));
    },
  }));

  return <div className="yaml-editor" ref={host} />;
}

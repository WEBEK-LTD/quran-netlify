import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useTr } from '../l10n';
import { coreTr } from '../locales/core';
import styles from './Toast.module.css';

export default function Toast() {
  const [state, set] = useStore();
  const tr = coreTr(useTr());
  const timer = useRef(null);

  useEffect(() => {
    if (state.toast) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => set({ toast: null }), 2600);
    }
  }, [state.toast]);

  if (!state.toast) return null;

  return (
    <div className={styles.toast} role="status" dir="auto">
      {/* toasts are usually translated where they are raised; a plain Arabic one is looked up here */}
      {typeof state.toast === 'string' ? tr(state.toast) : state.toast}
    </div>
  );
}

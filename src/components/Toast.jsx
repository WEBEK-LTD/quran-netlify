import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import styles from './Toast.module.css';

export default function Toast() {
  const [state, set] = useStore();
  const timer = useRef(null);

  useEffect(() => {
    if (state.toast) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => set({ toast: null }), 2600);
    }
  }, [state.toast]);

  if (!state.toast) return null;

  return (
    <div className={styles.toast}>
      {state.toast}
    </div>
  );
}

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '60vh', padding: 32,
          textAlign: 'center', direction: 'rtl',
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ color: 'var(--text)', marginBottom: 8 }}>حدث خطأ غير متوقع</h2>
          <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 24, maxWidth: 360 }}>
            {this.state.error?.message || 'خطأ غير معروف'}
          </p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              padding: '10px 28px', borderRadius: 10,
              background: 'var(--gold)', color: '#000',
              border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}>
            إعادة المحاولة
          </button>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = '/'; }}
            style={{
              padding: '8px 20px', borderRadius: 10, marginTop: 8,
              background: 'transparent', color: 'var(--text3)',
              border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer',
            }}>
            العودة للرئيسية
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { render } from 'preact';
import './base.css';

function App() {
  return (
    <div class="placeholder">
      <h1>Elementum</h1>
      <div>v{__APP_VERSION__}</div>
      <div>Language: {navigator.language}</div>
    </div>
  );
}

render(<App />, document.getElementById('app')!);

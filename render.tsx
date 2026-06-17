import React from 'react';
globalThis.React = React;
import { renderToString } from 'react-dom/server';
import App from './src/App.tsx';
import { useFranchiseStore } from './src/state/franchiseStore.ts';

try {
  useFranchiseStore.getState().createFranchise('vanderbilt');
  console.log("Rendering App after creating franchise...");
  renderToString(<App />);
  console.log("Rendered successfully!");
} catch (e) {
  console.error("Crash during render:", e);
}

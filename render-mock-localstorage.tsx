import React from 'react';
globalThis.React = React;
import { renderToString } from 'react-dom/server';
import App from './src/App.tsx';
import { useFranchiseStore } from './src/state/franchiseStore.ts';

try {
  useFranchiseStore.setState({
    save: {
      userProgramId: 'vanderbilt',
      // old save missing leagueRosters
      roster: [],
      // missing leagueCoachingStaffs
    } as any
  });
  console.log("Rendering App with old save...");
  renderToString(<App />);
  console.log("Rendered successfully!");
} catch (e) {
  console.error("Crash during render:", e);
}

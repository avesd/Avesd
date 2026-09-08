import { app } from 'electron';
app.setPath('userData', process.env.AVESD_WEB_TEST_PROFILE);
app.setPath('home', process.env.AVESD_WEB_TEST_PROFILE);
const { desktopReady } = await import('../out/main/index.js');
// Do not await app readiness at module scope: Electron completes entry loading first.
void desktopReady.then((gateway) => {
  // Test-only handoff to the synthetic harness; never exposed through a preload.
  globalThis.__avesdTestGateway = { url: gateway.url, get token() { return gateway.token; } };
});

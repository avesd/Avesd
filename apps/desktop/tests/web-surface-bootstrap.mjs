import { app } from 'electron';
app.setPath('userData', process.env.AVESD_WEB_TEST_PROFILE);
app.setPath('home', process.env.AVESD_WEB_TEST_PROFILE);
await import('../out/main/index.js');

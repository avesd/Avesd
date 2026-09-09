/**
 * @author Avesd
 * @package Desktop
 * @namespace TestE2eSupport
 * @description Bootstrap
 */

import { app } from "electron";

app.setPath("userData", process.env.AVESD_WEB_TEST_PROFILE);
app.setPath("home", process.env.AVESD_WEB_TEST_PROFILE);
const { desktopReady } = await import("../../../out/main/index.js");
void desktopReady.then(gateway => {

    globalThis.__avesdTestGateway = {
        url: gateway.url,
        get token() {

            return gateway.token;
        },
    };
});

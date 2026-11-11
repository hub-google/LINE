import {initializeLineSession} from "./line-session.js";
import {initializeRouteState} from "./route-state.js";
import {initializeServiceUnits} from "./service-units.js";
import {initializeSharedUi} from "./shared-ui.js";
import {initializeMerchantBrand} from "./merchant-brand.js";
import {initializeStaffView} from "./staff-list.js";
import {initializeStaffLayout} from "./staff-layout.js";
import {initializeDataLoading} from "./data-loading.js";
import {initializeClickActions} from "./click-actions.js";
import {initializeFormEvents} from "./form-events.js";
import {initializeStartup} from "./startup.js";
import {initializePickupMode} from "./pickup-mode.js";

// Initialize each domain before registering listeners and starting network reads.
initializeLineSession();
initializeRouteState();
initializeServiceUnits();
initializeSharedUi();
initializeMerchantBrand();

initializeStaffView();

initializeStaffLayout();
initializeDataLoading();

initializeClickActions();
initializeFormEvents();
initializePickupMode();
initializeStartup();

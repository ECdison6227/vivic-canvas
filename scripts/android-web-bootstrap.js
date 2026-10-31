import * as ownerModule from './app-runtime.js';
import * as browserModule from './browserRuntime-CMMGoec6.js';
import * as storeModule from './canvasStore-Kqevnh2f.js';
const owner = Object.values(ownerModule).find(value => value && typeof value.createOwnerDB === 'function' && typeof value.invalidateOwnerDB === 'function');
const browser = Object.values(browserModule).find(value => value && typeof value.getControlHost === 'function' && typeof value.getDisplayRuntime === 'function');
const canvasStore = Object.values(storeModule).find(value => value && typeof value.getState === 'function' && typeof value.dispatch === 'function');
if (owner && browser && canvasStore && typeof ownerModule.vivicOwnerServerVersion === 'function') {
  window.__vivicRemoteRuntime = { ...owner, ...browser, canvasStore, getOwnerServerVersion: ownerModule.vivicOwnerServerVersion };
  window.dispatchEvent(new Event('vivic:runtime-ready'));
}

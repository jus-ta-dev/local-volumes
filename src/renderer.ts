import { startMixer } from "./ui/renderer.ts";
const host = window as any;
if (!host.__LOCAL_VOLUMES__) {
  host.__LOCAL_VOLUMES__ = startMixer(host.__LOCAL_VOLUMES_INITIAL__);
  delete host.__LOCAL_VOLUMES_INITIAL__;
}

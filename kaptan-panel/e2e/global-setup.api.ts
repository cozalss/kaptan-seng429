import { resetBackendDemo } from "./backend";

/** http-mode suite only (`npm run e2e:api`): every run starts on a fresh demo day. */
export default async function globalSetup(): Promise<void> {
  await resetBackendDemo();
}

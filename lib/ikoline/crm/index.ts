export type { CustomerRecord, CreateCustomerInput } from "./types";
export {
  sanitizeAccountId,
  sanitizeCustomerName,
  sanitizeNotes,
  extractCustomerName,
  looksLikeNoAccount,
} from "./validate";
export { getCrmStore, resetCrmStoreForTests, getSeedAccounts, type CrmBackend, type CrmStore } from "./store";

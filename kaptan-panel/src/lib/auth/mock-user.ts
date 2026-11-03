/**
 * The one person of the test double: the mock session cookie and the mock API both act as
 * them. In a real build the person comes from GET /me. No imports on purpose (edge-safe).
 */
export const MOCK_USER = { uid: "sen", name: "Deniz" } as const;

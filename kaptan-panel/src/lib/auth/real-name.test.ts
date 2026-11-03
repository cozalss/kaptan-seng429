import { realName } from "./session-context";

describe("realName", () => {
  it("greets nobody by the API's placeholder", () => {
    for (const none of ["Sahip", "sahip", " SAHİP ", "Owner", "", "   ", null, undefined]) expect(realName(none)).toBeNull();
  });

  it("keeps a name someone actually gave", () => {
    expect(realName(" Ayşe ")).toBe("Ayşe");
  });
});

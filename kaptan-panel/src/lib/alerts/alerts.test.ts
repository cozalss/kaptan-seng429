import { ALERT_TEXT, alertFor, shouldNotify, type AlertKind } from "./alerts";
import { desktopAlertsOn, desktopPermission, raiseDesktopAlert, turnOffDesktopAlerts, turnOnDesktopAlerts } from "./desktop";

const calm = { kill_switch: "off" as const, halted_today: false };

describe("which desk event becomes an alert", () => {
  it("a new suggestion leads to that suggestion", () => {
    expect(alertFor({ event: "approval.requested", data: { proposal_id: "prop-7" } }, calm)).toEqual({ kind: "suggestion", body: "Yeni bir önerin var.", path: "/oneri/prop-7" });
  });

  it("the daily stop and the full stop lead home, once, when they begin", () => {
    expect(alertFor({ event: "halt", data: { kill_switch: "off", halted_today: true } }, calm)).toEqual({ kind: "halt", body: "Günlük zarar sınırına gelindi, yeni öneri durdu.", path: "/benim" });
    expect(alertFor({ event: "kill_switch", data: { kill_switch: "on", halted_today: false } }, calm)).toEqual({ kind: "stop", body: "KAPtan durduruldu.", path: "/benim" });
  });

  it("says nothing when the state was already so, or when it ends", () => {
    expect(alertFor({ event: "halt", data: { kill_switch: "off", halted_today: true } }, { kill_switch: "off", halted_today: true })).toBeNull();
    expect(alertFor({ event: "halt", data: { kill_switch: "off", halted_today: false } }, { kill_switch: "off", halted_today: true })).toBeNull();
    expect(alertFor({ event: "kill_switch", data: { kill_switch: "on", halted_today: false } }, { kill_switch: "on", halted_today: false })).toBeNull();
    expect(alertFor({ event: "kill_switch", data: { kill_switch: "off", halted_today: false } }, { kill_switch: "on", halted_today: false })).toBeNull();
  });

  it("treats an event that arrives before the first status as news", () => {
    expect(alertFor({ event: "kill_switch", data: { kill_switch: "on", halted_today: false } }, null)?.kind).toBe("stop");
    expect(alertFor({ event: "halt", data: { kill_switch: "off", halted_today: true } }, null)?.kind).toBe("halt");
  });

  it("never carries a share's code, a company, an amount or a direction", () => {
    for (const kind of Object.keys(ALERT_TEXT) as AlertKind[]) {
      expect(ALERT_TEXT[kind]).not.toMatch(/\d|₺|TL|\bAL\b|\bSAT\b|[A-Z]{4,}/);
    }
  });
});

describe("when an alert may be shown", () => {
  const ok = { enabled: true, permission: "granted" as const, looking: false };
  it("only when the person turned it on, the browser allows it and they are not looking at the app", () => {
    expect(shouldNotify(ok)).toBe(true);
    expect(shouldNotify({ ...ok, enabled: false })).toBe(false);
    expect(shouldNotify({ ...ok, looking: true })).toBe(false);
    for (const permission of ["denied", "default", "unsupported"] as const) expect(shouldNotify({ ...ok, permission })).toBe(false);
  });
});

describe("the browser side", () => {
  const shown: Array<{ title: string; body?: string; tag?: string; onclick: (() => void) | null; close: () => void }> = [];
  let permission: NotificationPermission = "default";
  let answer: NotificationPermission = "granted";

  class FakeNotification {
    static get permission() {
      return permission;
    }
    static requestPermission = vi.fn(async () => {
      permission = answer;
      return answer;
    });
    onclick: (() => void) | null = null;
    close = vi.fn();
    constructor(
      readonly title: string,
      readonly options: NotificationOptions = {},
    ) {
      shown.push({ title, body: options.body, tag: options.tag, onclick: null, close: this.close });
      const mine = shown[shown.length - 1]!;
      Object.defineProperty(this, "onclick", { set: (fn: () => void) => (mine.onclick = fn), get: () => mine.onclick });
    }
  }

  const away = () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
  };

  beforeEach(() => {
    shown.length = 0;
    permission = "default";
    answer = "granted";
    FakeNotification.requestPermission.mockClear();
    vi.stubGlobal("Notification", FakeNotification);
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks for permission only when the person turns alerts on", async () => {
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    expect(desktopAlertsOn()).toBe(false);
    expect(await turnOnDesktopAlerts()).toBe("granted");
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(desktopAlertsOn()).toBe(true);
    turnOffDesktopAlerts();
    expect(desktopAlertsOn()).toBe(false);
  });

  it("stays off when the browser refuses, and says so", async () => {
    answer = "denied";
    expect(await turnOnDesktopAlerts()).toBe("denied");
    expect(desktopAlertsOn()).toBe(false);
    expect(desktopPermission()).toBe("denied");
  });

  it("reports a browser without notifications", async () => {
    vi.stubGlobal("Notification", undefined);
    expect(desktopPermission()).toBe("unsupported");
    expect(await turnOnDesktopAlerts()).toBe("unsupported");
    expect(desktopAlertsOn()).toBe(false);
  });

  it("is off again once the browser's permission is taken back", async () => {
    await turnOnDesktopAlerts();
    permission = "denied";
    expect(desktopAlertsOn()).toBe(false);
  });

  it("shows the alert when the person is away, and a click brings the right screen forward", async () => {
    await turnOnDesktopAlerts();
    away();
    const open = vi.fn();
    const focus = vi.spyOn(window, "focus").mockImplementation(() => undefined);
    expect(raiseDesktopAlert({ kind: "suggestion", body: ALERT_TEXT.suggestion, path: "/oneri/prop-7" }, open)).toBe(true);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ title: "KAPtan", body: "Yeni bir önerin var.", tag: "kaptan-suggestion" });
    shown[0]!.onclick?.();
    expect(focus).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith("/oneri/prop-7");
    expect(shown[0]!.close).toHaveBeenCalled();
  });

  it("shows nothing while the person is looking at the app, or before they turned it on", async () => {
    const alert = { kind: "stop" as const, body: ALERT_TEXT.stop, path: "/benim" };
    away();
    expect(raiseDesktopAlert(alert, vi.fn())).toBe(false);
    await turnOnDesktopAlerts();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    expect(raiseDesktopAlert(alert, vi.fn())).toBe(false);
    expect(shown).toHaveLength(0);
  });

  it("survives a browser that throws on `new Notification`", async () => {
    await turnOnDesktopAlerts();
    away();
    vi.stubGlobal(
      "Notification",
      Object.assign(
        function Broken() {
          throw new TypeError("Illegal constructor");
        },
        { permission: "granted", requestPermission: async () => "granted" as const },
      ),
    );
    expect(raiseDesktopAlert({ kind: "halt", body: ALERT_TEXT.halt, path: "/benim" }, vi.fn())).toBe(false);
  });
});

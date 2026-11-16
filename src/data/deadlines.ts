// How long a booking or consultation send may take, in ms: one place for the
// form and the Worker, so the Worker always answers before the form gives up.
//
// Not exported from worker/index.ts: the Workers runtime reads every named
// export of the Worker's module as an entrypoint, and refuses to start on
// one that is a number.

/** The form's: past this the guest is told the send failed, with the address
    to write to instead. */
export const SEND_DEADLINE = 20_000;

/** The Worker's, for each call to the mail service. A booking makes at most
    two, so the Worker answers well inside the form's deadline. */
export const MAIL_DEADLINE = 8_000;

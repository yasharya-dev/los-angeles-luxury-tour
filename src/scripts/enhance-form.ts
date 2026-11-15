/**
 * Progressive behaviour shared by the consultation and booking forms.
 *
 * Both forms work without this: the browser checks the required fields, the
 * form posts normally and the Worker redirects to the right page afterwards.
 * With it, validation runs on blur rather than on every keystroke, and the
 * form sends in the background: on success it moves to the page the Worker
 * names (the booking's received page), or shows its own panel.
 *
 * Expects, inside the form: `[data-form-error]`, `[data-send-error]` and
 * `[data-submit]`; and, for a form that stays on its page, a `[data-form-ok]`
 * panel next to it. A required field `f-x` pairs with an error line `e-x`; a
 * group of required radios named `x` does too.
 */
type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export function enhanceForm(form: HTMLFormElement): void {
  // Two components on one page may each ship this script.
  if (form.dataset.enhanced) return;
  form.dataset.enhanced = 'true';

  const scope = form.parentElement ?? document;
  const ok = scope.querySelector<HTMLElement>('[data-form-ok]');
  const formErr = form.querySelector<HTMLElement>('[data-form-error]');
  const sendErr = form.querySelector<HTMLElement>('[data-send-error]');
  const submit = form.querySelector<HTMLButtonElement>('[data-submit]');
  if (!formErr || !sendErr || !submit) return;

  // The script checks the fields itself from here, with its own messages.
  // In the markup the form is left to the browser, for a visitor without it.
  form.noValidate = true;

  /* The consultation form's plan, from the card that linked to it. Without
     script the select opens on its first option, which is a fine answer too. */
  // Cast, not a generic: @cloudflare/workers-types merges HTMLRewriter's
  // Element into the DOM one, and HTMLSelectElement redeclares remove(), so
  // it alone fails querySelector<T>'s constraint under the shared tsconfig.
  const service = form.querySelector('select[name="service"]') as HTMLSelectElement | null;
  const wanted = new URLSearchParams(location.search).get('service');
  if (service && wanted) {
    const known = Array.from(service.options).some((o) => o.value === wanted);
    if (known) service.value = wanted;
  }

  /* A date picker should not offer yesterday. Local date, not UTC: at 8pm in
     Los Angeles the UTC date is already tomorrow. */
  const today = new Date();
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  form
    .querySelectorAll<HTMLInputElement>('input[type="date"][data-min-today]')
    .forEach((d) => (d.min = local));

  // Read when needed, not once: a field can become required later (the
  // booking form's route does, on a one-way choice).
  const required = () =>
    (Array.from(form.querySelectorAll('[required]')) as Field[]).filter((f) => !f.disabled);

  const key = (input: Field) =>
    input instanceof HTMLInputElement && input.type === 'radio'
      ? input.name
      : input.id.replace(/^f-/, '');

  const showError = (input: Field, on: boolean) => {
    const group =
      input instanceof HTMLInputElement && input.type === 'radio'
        ? (Array.from(form.querySelectorAll(`input[name="${input.name}"]`)) as Field[])
        : [input];
    for (const member of group) {
      member.setAttribute('aria-invalid', String(on));
      member.classList.toggle('input--err', on);
    }
    const msg = document.getElementById(`e-${key(input)}`);
    if (msg) msg.hidden = !on;
  };

  /* On blur, not on input: do not correct someone mid-type. */
  form.addEventListener('focusout', (e) => {
    const input = e.target as Field;
    if (!input.required || input.disabled) return;
    if (input.value.trim() && input.type !== 'radio') showError(input, !input.checkValidity());
  });
  const clear = (e: Event) => {
    const input = e.target as Field;
    if (input.classList.contains('input--err') && input.checkValidity()) {
      showError(input, false);
      /* Once the last mark is gone, the summary pointing at them goes too. */
      if (!form.querySelector('.input--err')) formErr.hidden = true;
    }
  };
  form.addEventListener('input', clear);
  form.addEventListener('change', clear);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    sendErr.hidden = true;

    let bad = false;
    for (const input of required()) {
      const invalid = !input.checkValidity();
      showError(input, invalid);
      if (invalid && !bad) {
        input.focus();
        bad = true;
      }
    }

    formErr.hidden = !bad;
    if (bad) return;

    submit.disabled = true;
    submit.textContent = submit.dataset.sending ?? 'Sending';

    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json().catch(() => ({}))) as { next?: string };

      // The same page a visitor without script lands on, so there is one
      // received screen, and a reload keeps it.
      if (body.next) {
        location.assign(body.next);
        return;
      }
      if (!ok) throw new Error('no panel');
      form.hidden = true;
      ok.hidden = false;
      ok.setAttribute('tabindex', '-1');
      ok.focus();
    } catch {
      sendErr.hidden = false;
      submit.disabled = false;
      submit.textContent = submit.dataset.label ?? 'Send';
    }
  });
}

/** Enhance every form on the page that opts in with `data-enhance`. */
export function enhanceForms(): void {
  document
    .querySelectorAll<HTMLFormElement>('form[data-enhance]')
    .forEach(enhanceForm);
}

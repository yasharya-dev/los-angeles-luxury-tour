/**
 * Progressive behaviour shared by the contact and booking forms.
 *
 * Both forms work without this: they post normally and the Worker redirects
 * to the right page afterwards. With it, the plan a card linked with is
 * pre-selected, validation runs on blur rather than on every keystroke, and
 * a successful send swaps the form for its panel without leaving the page.
 *
 * Expects, inside the form: `[data-form-error]`, `[data-send-error]` and
 * `[data-submit]`; and next to the form, a `[data-form-ok]` panel. Each
 * required field `f-x` pairs with an error line `e-x`.
 */
export function enhanceForm(form: HTMLFormElement): void {
  // Two components on one page may each ship this script.
  if (form.dataset.enhanced) return;
  form.dataset.enhanced = 'true';

  const scope = form.parentElement ?? document;
  const ok = scope.querySelector<HTMLElement>('[data-form-ok]');
  const formErr = form.querySelector<HTMLElement>('[data-form-error]');
  const sendErr = form.querySelector<HTMLElement>('[data-send-error]');
  const submit = form.querySelector<HTMLButtonElement>('[data-submit]');
  if (!ok || !formErr || !sendErr || !submit) return;

  /* Static build, so the plan a card linked with is selected here. Without
     JS the select opens on its first option, which is a fine answer too. */
  // Cast, not a generic: @cloudflare/workers-types merges HTMLRewriter's
  // Element into the DOM one, and HTMLSelectElement redeclares remove(), so
  // it alone fails querySelector<T>'s constraint under the shared tsconfig.
  const service = form.querySelector('[name="service"]') as HTMLSelectElement | null;
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

  type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

  const showError = (input: Field, on: boolean) => {
    const msg = document.getElementById(`e-${input.id.replace('f-', '')}`);
    input.setAttribute('aria-invalid', String(on));
    input.classList.toggle('input--err', on);
    if (msg) msg.hidden = !on;
  };

  const required = Array.from(form.querySelectorAll('[required]')) as Field[];

  /* On blur, not on input - do not correct someone mid-type. */
  required.forEach((input) => {
    input.addEventListener('blur', () => {
      if (input.value.trim()) showError(input, !input.checkValidity());
    });
    const clear = () => {
      if (input.classList.contains('input--err') && input.checkValidity()) {
        showError(input, false);
        /* Once the last mark is gone, the summary pointing at them goes too. */
        if (!form.querySelector('.input--err')) formErr.hidden = true;
      }
    };
    input.addEventListener('input', clear);
    input.addEventListener('change', clear);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    sendErr.hidden = true;

    let bad = false;
    required.forEach((input) => {
      const invalid = !input.checkValidity();
      showError(input, invalid);
      if (invalid && !bad) {
        input.focus();
        bad = true;
      }
    });

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

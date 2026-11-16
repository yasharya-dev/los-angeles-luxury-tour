/**
 * Progressive behaviour shared by the consultation and booking forms.
 *
 * Both forms work without this: the browser checks the required fields, the
 * form posts normally and the Worker redirects to the right page afterwards.
 * With it, validation runs on blur rather than on every keystroke, and the
 * form sends in the background, then moves to the page the Worker names: the
 * same page a visitor without script lands on.
 *
 * Expects, inside the form: `[data-form-error]`, `[data-send-error]` and
 * `[data-submit]`. A required field `f-x` pairs with an error line `e-x`; a
 * group of required radios named `x` does too.
 */
import { threeYearsOn, todayInLA } from '../data/calendar';

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

// The Worker names the field it refused. Its own word for each, here.
const FIELD: Record<string, string> = {
  name: '#f-name',
  email: '#f-email',
  date: '#f-date',
  guests: '#f-guests',
  type: 'input[name="type"]',
  route: 'input[name="route"]',
};

declare global {
  interface Window {
    turnstile?: { reset: () => void };
  }
}

export function enhanceForm(form: HTMLFormElement): void {
  // Two components on one page may each ship this script.
  if (form.dataset.enhanced) return;
  form.dataset.enhanced = 'true';

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

  /* A date picker should not offer a day already past where the plan takes
     place, nor one further out than the Worker takes: the same two dates the
     Worker checks, wherever the guest is. Set again on every send, for a page
     left open past midnight in Los Angeles (late afternoon in Japan). */
  const bound = () => {
    const today = todayInLA();
    form
      .querySelectorAll<HTMLInputElement>('input[type="date"][data-min-today]')
      .forEach((d) => {
        d.min = today;
        d.max = threeYearsOn(today);
      });
  };
  bound();

  // Bring a field to fix into view with its label, then focus it. Safari does
  // not scroll a focused radio or select into view by itself.
  const reveal = (input: Field) => {
    const box = input.closest('fieldset, .field') ?? input;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
    input.focus({ preventScroll: true });
  };

  const reset = () => {
    submit.disabled = false;
    submit.textContent = submit.dataset.label ?? 'Send';
  };

  /* Back from the next page can restore this one as it was left: sending. */
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) reset();
  });

  // Read when needed, not once: a field can become required later (the
  // booking form's route does, on a one-way choice).
  const required = () =>
    (Array.from(form.querySelectorAll('[required]')) as Field[]).filter((f) => !f.disabled);

  const isRadio = (input: Field): input is HTMLInputElement =>
    input instanceof HTMLInputElement && input.type === 'radio';

  // Spaces alone are not an answer, though the browser accepts them.
  const valid = (input: Field) =>
    input.checkValidity() && (isRadio(input) || input.value.trim() !== '');

  const showError = (input: Field, on: boolean) => {
    const id = `e-${isRadio(input) ? input.name : input.id.replace(/^f-/, '')}`;
    const group = isRadio(input)
      ? (Array.from(form.querySelectorAll(`input[name="${input.name}"]`)) as Field[])
      : [input];
    const fieldset = isRadio(input) ? input.closest('fieldset') : null;
    // The error is the field's description only while it shows: a hidden
    // line referenced at rest is still read out as one.
    for (const el of [...group, ...(fieldset ? [fieldset] : [])]) {
      const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((t) => t && t !== id);
      if (on) ids.push(id);
      if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
      else el.removeAttribute('aria-describedby');
    }
    for (const member of group) {
      member.setAttribute('aria-invalid', String(on));
      member.classList.toggle('input--err', on);
    }
    const msg = document.getElementById(id);
    if (msg) msg.hidden = !on;
  };

  /* On blur, not on input: do not correct someone mid-type. */
  form.addEventListener('focusout', (e) => {
    const input = e.target as Field;
    if (!input.required || input.disabled || isRadio(input)) return;
    if (input.value.trim()) showError(input, !valid(input));
  });
  const clear = (e: Event) => {
    const input = e.target as Field;
    if (input.classList.contains('input--err') && (input.disabled || valid(input))) {
      showError(input, false);
      /* Once the last mark is gone, the summary pointing at them goes too. */
      if (!form.querySelector('.input--err')) formErr.hidden = true;
    }
  };
  form.addEventListener('input', clear);
  form.addEventListener('change', clear);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    sendErr.hidden = true;

    bound();

    // Every mark first, then one scroll to the first. Safari stops a smooth
    // scroll when the page grows above it, which each error line shown
    // after the scroll had started would do.
    let first: Field | undefined;
    for (const input of required()) {
      const invalid = !valid(input);
      showError(input, invalid);
      if (invalid && !first) first = input;
    }
    formErr.hidden = !first;
    if (first) {
      reveal(first);
      return;
    }

    submit.disabled = true;
    submit.textContent = submit.dataset.sending ?? 'Sending';

    let body: { ok?: boolean; next?: string; error?: string } = {};
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      body = (await res.json().catch(() => ({}))) as typeof body;
      if (res.ok && body.next) {
        location.assign(body.next);
        return;
      }
    } catch {
      /* the network: the same as a failed send */
    }

    // A token is good for one try. The next try needs a new one.
    window.turnstile?.reset();
    reset();

    // A field the Worker refused is the visitor's to fix, not a failure to send.
    const field = body.error ? FIELD[body.error] : undefined;
    // A cast, as for the select above: the shared types reject Field here.
    const input = field ? (form.querySelector(field) as Field | null) : null;
    if (input || body.error === 'missing') {
      // The page settles before the scroll, as above.
      formErr.hidden = false;
      if (input) {
        showError(input, true);
        reveal(input);
      }
      return;
    }
    sendErr.hidden = false;
    // Focus went with the button while it was disabled; put it back on it.
    submit.focus();
  });
}

/** Enhance every form on the page that opts in with `data-enhance`. */
export function enhanceForms(): void {
  document
    .querySelectorAll<HTMLFormElement>('form[data-enhance]')
    .forEach(enhanceForm);
}

// Copy that carries its own line breaks.
//
// Japanese has no spaces, so left alone a browser breaks a line wherever it
// runs out of room, mid-word included. Japanese copy is therefore written as
// an array of phrases: the line may fold between two phrases and nowhere
// else. English is a plain string and wraps on its own.
//
// Rendered by components/Phrases.astro.

/** A break Amelia asked for at every width, as an entry in a phrase array. */
export const BR = '\n';

export type Text = string | readonly string[];

/** The same copy as one plain string, for a title tag or an aria-label. */
export function plain(text: Text): string {
  return typeof text === 'string' ? text : text.filter((p) => p !== BR).join('');
}

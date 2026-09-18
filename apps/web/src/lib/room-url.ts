const PREFIX = "#/s/";

/** The room is in the URL so the link can be shared; everyone who opens it joins the same flow. */
export const sessionIdFromHash = (hash: string): string | null => {
  if (!hash.startsWith(PREFIX)) return null;
  const id = decodeURIComponent(hash.slice(PREFIX.length)).trim();
  return id === "" ? null : id;
};

export const hashForSession = (sessionId: string): string => `${PREFIX}${encodeURIComponent(sessionId)}`;

/**
 * The approver allow-list for next actions (`APPROVER_EMAILS` secret).
 *
 * Functions cannot identify their caller: `ctx.accessToken` is a platform app token without user
 * claims. Approval is therefore proven by data-service rows whose create policy ties `authorEmail`
 * to the writer's `email` claim; functions only check that author against this list.
 */

const EMAIL = /^[^\s@]+@[^\s@]+$/;

export function parseApprovers(value: string | undefined | null): Set<string> {
  return new Set(
    String(value ?? '')
      .split(/[,;\s]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => EMAIL.test(entry))
  );
}

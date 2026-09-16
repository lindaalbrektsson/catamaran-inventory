import { randomUUID } from 'node:crypto';
// No password reads/writes; never print Auth email/phone or API responses.
export async function migrateAliases(admin, entries, actor, domain, apply = false) {
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(domain)) throw new Error('INVALID_INTERNAL_DOMAIN');
  const prepared = [];
  for (const entry of entries) {
    const result = await admin.auth.admin.getUserById(entry.id);
    if (result.error || result.data.user?.id !== entry.id) throw new Error('AUTH_USER_NOT_FOUND');
    prepared.push({entry,user:result.data.user});
  }
  const outcomes = [];
  for (const {entry,user} of prepared) {
    if (apply && !user.email) {
      const result = await admin.auth.admin.updateUserById(entry.id,{email:`u_${randomUUID().replaceAll('-','')}@${domain}`,email_confirm:true});
      if (result.error || result.data.user?.id !== entry.id || result.data.user.phone !== user.phone) throw new Error('AUTH_IDENTITY_UPDATE_FAILED');
    }
    if (apply) {
      const result = await admin.rpc('migrate_username_alias',{p_actor:actor,p_target:entry.id,p_username:entry.username});
      if (result.error) throw new Error('USERNAME_ASSIGNMENT_FAILED');
    }
    outcomes.push({id:entry.id,username:entry.username,addInternalEmail:!user.email,applied:apply});
  }
  return outcomes;
}

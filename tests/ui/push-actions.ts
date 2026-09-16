export async function hasPush() {
  return sessionStorage.getItem('push-on') === 'true';
}
export async function savePush() {
  sessionStorage.setItem('push-on', 'true');
  return true;
}
export async function removePush() {
  sessionStorage.removeItem('push-on');
  return true;
}
export async function testPush() {
  return true;
}

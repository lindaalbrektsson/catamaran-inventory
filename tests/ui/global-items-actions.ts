export async function manageGlobalItem(input: unknown) {
  sessionStorage.setItem('global-item-fixture', JSON.stringify(input));
  return { id: 'fixture' };
}

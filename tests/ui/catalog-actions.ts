export async function updateCatalogItem(id: string, value: unknown) {
  sessionStorage.setItem('item-edit-fixture', JSON.stringify({ id, value }));
  return { success: true };
}
export async function saveCategory() {
  return { success: true };
}
export async function archiveInventoryItem(id: string) {
  sessionStorage.setItem('archived-item-fixture', id);
  return { success: true };
}

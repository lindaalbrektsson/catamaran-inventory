export async function deleteTestData(table: string, id: string) {
  sessionStorage.setItem('test-delete', JSON.stringify({ table, id }));
  return { error: 'testDeleteBlocked' as const };
}

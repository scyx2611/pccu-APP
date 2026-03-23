export function formatUpdatedAt(updatedAt: number | null) {
  if (!updatedAt) return '';

  const date = new Date(updatedAt);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

type UpdatedAtTextOptions = {
  updatedAt: number | null;
  updatingLabel: string;
  emptyLabel: string;
  isUpdating?: boolean;
};

export function buildUpdatedAtText({
  updatedAt,
  updatingLabel,
  emptyLabel,
  isUpdating = false,
}: UpdatedAtTextOptions) {
  if (isUpdating) {
    return updatingLabel;
  }

  const formatted = formatUpdatedAt(updatedAt);
  if (formatted) {
    return `最後更新 ${formatted}`;
  }

  return emptyLabel;
}

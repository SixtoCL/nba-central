export function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function teamSlug(team) {
  return slugify(`${team.city}-${team.name}`);
}

export function playerSlug(player) {
  return slugify(`${player.first_name}-${player.last_name}-${player.id}`);
}

type FavoriteProject = { projectKey: string; isFavorite: boolean };

export function compareFavoriteProjects(left: FavoriteProject, right: FavoriteProject) {
  return Number(right.isFavorite) - Number(left.isFavorite) || left.projectKey.localeCompare(right.projectKey);
}

export function filterFavoriteProjects<T extends FavoriteProject>(projects: T[], favoritesOnly: boolean, search: string) {
  const query = search.trim().toLowerCase();
  return projects.filter((project) => (!favoritesOnly || project.isFavorite) && (!query || project.projectKey.toLowerCase().includes(query)));
}

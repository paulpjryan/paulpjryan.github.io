import Route from '@ember/routing/route';

export default class Projects extends Route {
  // normal class body definition here
  model() {
    return $.get('https://api.github.com/users/paulpjryan/repos?sort=pushed');
  }
}

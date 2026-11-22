// Which published version this copy of the code is. The publishing workflow
// (.github/workflows/deploy.yml) overwrites this file with the same short commit id it
// writes into version.json; in the project folder itself it stays 'dev'.
//
// app.js compares the two: version.json says what the site has, this says what is actually
// running here. Right after publishing, a tablet could start the page over and still be
// handed old files; because it had "seen" the new version it then stayed on the old code
// until the next one came out. Now it notices and tries again.
export const BUILD = 'dev';

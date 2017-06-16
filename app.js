var fetch = require("node-fetch");
var parser = require("git-diff-parser");
var _ = require("lodash");
var Linter = require("eslint").Linter;
var linter = new Linter();

const token = "";
const user = "";
const repo = "";
const issue = 0;

const github = async (route, accept = "application/json") => {
  const options = {
    headers: {
      Authorization: `token ${token}`,
      accept
    }
  };

  return fetch(route, options).then(response => {
    if (
      accept === "application/json" ||
      accept === "application/vnd.github.v3.raw"
    ) {
      return response.json();
    } else {
      return response.buffer();
    }
  });
};

const getPullRequestCommits = async (owner, repo, number) =>
  github(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/commits`
  );

const getFileContents = async (owner, repo, path) =>
  github(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    "Accept: application/vnd.github.v3.raw"
  );

const start = async () => {
  console.log("fetching pull request commits");
  const commits = await getPullRequestCommits(user, repo, issue);

  const newestCommitSha = _.sortBy(
    commits,
    commit => -new Date(commit.commit.author.date).getTime()
  )[0].sha;

  console.log("fetching diffs");
  const diffs = await Promise.all(
    commits.map(async commit => {
      console.log(`fetching diff for: ${commit.sha}`);

      const diff = await github(commit.url, "application/vnd.github.v3.diff");

      return diff;
    })
  );

  const parsedDiffs = diffs.map(diff => parser(diff.toString()));

  const commitFiles = parsedDiffs.map(diff => diff.commits[0].files);

  const filesPaths = new Map();

  commitFiles.forEach(files => {
    files.forEach(file => {
      if (!file.name.endsWith(".js")) {
        return;
      }

      console.log(
        `inserting ${file.name} => ${file.lines
          .filter(includedType)
          .map(line => line.ln1)}`
      );

      let lines = file.lines.filter(includedType).map(line => line.ln1);

      if (filesPaths.has(file.name)) {
        lines = _.uniq([...filesPaths.get(file.name), ...lines]);
      }

      filesPaths.set(file.name, lines);
    });
  });

  // console.log(filesPaths);

  const fileContents = await Promise.all(
    Array.from(filesPaths).map(([key]) => getFileContents(user, repo, key))
  );

  console.log(
    fileContents.map(c => linter.verify(c.toString(), { rules: { semi: 2 } }))
  );

  var messages = linter.verify("var foo;", {
    rules: {
      semi: 2
    }
  });
};

const includedType = line => line.type === "added" || line.type === "modified";

start();

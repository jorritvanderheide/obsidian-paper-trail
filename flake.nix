{
  description = "Paper Trail Obsidian plugin";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        package = builtins.fromJSON (builtins.readFile ./package.json);
      in
      {
        packages.default = pkgs.buildNpmPackage {
          # Both from package.json, so a rename or a release cannot leave them behind.
          pname = package.name;
          inherit (package) version;
          src = ./.;
          # Update with: nix run nixpkgs#prefetch-npm-deps -- package-lock.json
          npmDepsHash = "sha256-inbPgCQWhEFvLhnq/iUqpk2gWdege/c+DNCu5IvOedg=";
          nodejs = pkgs.nodejs_24;
          # The lint and the tests run with the build, so nix flake check is the
          # whole check.
          doCheck = true;
          checkPhase = ''
            runHook preCheck
            npm run lint
            npm test
            runHook postCheck
          '';
          installPhase = ''
            mkdir -p $out
            cp main.js manifest.json styles.css $out/
          '';
        };

        # CI runs nix flake check, which builds this, so npmDepsHash can't fall
        # behind package-lock.json unnoticed.
        checks.default = self.packages.${system}.default;

        devShells.default = pkgs.mkShell {
          buildInputs = [ pkgs.nodejs_24 ];
        };
      }
    );
}

{
  description = "Zotero Speed Reader Obsidian plugin";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        package = builtins.fromJSON (builtins.readFile ./package.json);
      in
      {
        packages.default = pkgs.buildNpmPackage {
          pname = "obsidian-zotero-speed-reader";
          inherit (package) version;
          src = ./.;
          # Update with: nix run nixpkgs#prefetch-npm-deps -- package-lock.json
          npmDepsHash = "sha256-M7ufJOn9kVeAHM9HYTa7fy8TKAu5TWa6gC/iCITEXWg=";
          nodejs = pkgs.nodejs_24;
          installPhase = ''
            mkdir -p $out
            cp main.js manifest.json styles.css $out/
          '';
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [ pkgs.nodejs_24 ];
        };
      }
    );
}

{
  description = "scemas-platform: smart city environmental monitoring (SE 3A04)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/master";

  outputs = {self, nixpkgs}: let
    systems = ["x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin"];
    forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f system nixpkgs.legacyPackages.${system});
    mkScemasCli = pkgs: let
      runtimePackages = with pkgs; [
        cargo
        rustc
        bun
        nodejs_22
        postgresql_16
      ];
    in pkgs.rustPlatform.buildRustPackage {
      pname = "scemas";
      version = self.shortRev or self.dirtyShortRev or "0.1.0";
      src = ./.;
      cargoLock.lockFile = ./Cargo.lock;
      cargoBuildFlags = ["-p" "scemas-cli" "--bin" "scemas"];
      doCheck = false;
      nativeBuildInputs = with pkgs; [installShellFiles makeWrapper pkg-config];
      postInstall = ''
        mkdir -p completions
        "$out/bin/scemas" completion bash > completions/scemas.bash
        "$out/bin/scemas" completion fish > completions/scemas.fish
        "$out/bin/scemas" completion zsh > completions/_scemas
        installShellCompletion \
          --cmd scemas \
          --bash completions/scemas.bash \
          --fish completions/scemas.fish \
          --zsh completions/_scemas
      '';
      postFixup = ''
        wrapProgram "$out/bin/scemas" \
          --prefix PATH : ${pkgs.lib.makeBinPath runtimePackages}
      '';
      meta = {
        description = "agent-friendly local control plane for scemas";
        mainProgram = "scemas";
      };
    };
  in rec {
    packages = forAllSystems (system: pkgs: let
      scemas = mkScemasCli pkgs;
    in {
      default = scemas;
      scemas = scemas;
    });

    apps = forAllSystems (system: _: let
      scemas = packages.${system}.scemas;
    in {
      default = {
        type = "app";
        program = "${scemas}/bin/scemas";
      };
      scemas = {
        type = "app";
        program = "${scemas}/bin/scemas";
      };
    });

    devShells = forAllSystems (system: pkgs: let
      scemas = packages.${system}.scemas;
      postgresBin = pkgs.lib.getBin pkgs.postgresql_16;
      pgCtl = pkgs.lib.getExe' pkgs.postgresql_16 "pg_ctl";
      initdb = pkgs.lib.getExe' pkgs.postgresql_16 "initdb";
      createdb = pkgs.lib.getExe' pkgs.postgresql_16 "createdb";
    in {
      default = pkgs.mkShell {
        packages = with pkgs; [
          cargo clippy rustc rustfmt rust-analyzer
          bun nodejs_22
          postgresBin
          pkg-config openssl python3
          scemas
        ];
        env = {
          RUST_SRC_PATH = "${pkgs.rustPlatform.rustLibSrc}";
          PGPORT = "5432";
          PGHOST = "localhost";
          POSTGRES_BIN_DIR = "${postgresBin}/bin";
          PG_CTL = pgCtl;
          INITDB = initdb;
          CREATEDB = createdb;
          DATABASE_URL = "postgres://scemas:scemas@localhost:5432/scemas";
        };
        shellHook = ''
          export PATH="$POSTGRES_BIN_DIR:$PATH"
          export PGDATA="''${PGDATA:-$PWD/.pgdata}"
          export FPATH="${scemas}/share/zsh/site-functions''${FPATH:+:$FPATH}"
          export XDG_DATA_DIRS="${scemas}/share''${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}"
          if [ -n "''${BASH_VERSION:-}" ] && [ -f "${scemas}/share/bash-completion/completions/scemas" ]; then
            source "${scemas}/share/bash-completion/completions/scemas"
          fi
          echo "[scemas] ready. try: scemas --help, scemas dev up, scemas dev up --reload"
        '';
      };
    });

    formatter = forAllSystems (_: pkgs: pkgs.alejandra);
  };
}

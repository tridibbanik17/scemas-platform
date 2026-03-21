{
  description = "scemas-platform: smart city environmental monitoring (SE 3A04)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/master";

  outputs = {self, nixpkgs}: let
    systems = ["x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin"];
    forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
  in {
    devShells = forAllSystems (pkgs: let
      # resolve project root at runtime: git root or cwd
      findRoot = ''
        SCEMAS_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
      '';

      # first-time setup, idempotent via .derived sentinel
      firstTimeSetup = ''
        ${findRoot}
        if [ ! -f "$SCEMAS_ROOT/.derived" ]; then
          echo "[scemas] first-time setup"
          if [ ! -f "$SCEMAS_ROOT/.env" ]; then
            cp "$SCEMAS_ROOT/.env.example" "$SCEMAS_ROOT/.env"
            echo "[scemas] created .env from .env.example"
          fi
          (cd "$SCEMAS_ROOT" && bun install)
          touch "$SCEMAS_ROOT/.derived"
          echo "[scemas] first-time setup complete"
        fi
        if [ -f "$SCEMAS_ROOT/.env" ]; then
          set -a; source "$SCEMAS_ROOT/.env"; set +a
        fi
      '';

      # postgres management
      pg_init = pkgs.writeShellScriptBin "pg_init" ''
        if [ ! -d "$PGDATA" ]; then
          echo "initializing postgres in $PGDATA"
          ${pkgs.postgresql_16}/bin/initdb -D "$PGDATA" -U scemas
          echo "host all all 127.0.0.1/32 trust" >> "$PGDATA/pg_hba.conf"
          echo "host all all ::1/128 trust" >> "$PGDATA/pg_hba.conf"
          echo "unix_socket_directories = '$PGDATA'" >> "$PGDATA/postgresql.conf"
          echo "port = $PGPORT" >> "$PGDATA/postgresql.conf"
        else
          echo "postgres already initialized at $PGDATA"
        fi
      '';
      pg_start = pkgs.writeShellScriptBin "pg_start" ''
        if [ ! -d "$PGDATA" ]; then
          echo "run pg_init first"
          exit 1
        fi
        ${pkgs.postgresql_16}/bin/pg_ctl -D "$PGDATA" -l "$PGDATA/postgres.log" -o "-k $PGDATA" start
        ${pkgs.postgresql_16}/bin/createdb -h "$PGDATA" -p "$PGPORT" -U scemas scemas 2>/dev/null || true
      '';
      pg_stop = pkgs.writeShellScriptBin "pg_stop" ''
        ${pkgs.postgresql_16}/bin/pg_ctl -D "$PGDATA" stop
      '';

      # workflow commands as real executables (survive bash→zsh handoff)
      scemas-db = pkgs.writeShellScriptBin "scemas-db" ''
        if command -v pg_start >/dev/null 2>&1; then
          echo "[scemas] starting postgres via nix"
          pg_init 2>/dev/null
          pg_start
        elif command -v docker >/dev/null 2>&1; then
          ${findRoot}
          echo "[scemas] starting postgres via docker-compose"
          docker compose -f "$SCEMAS_ROOT/docker-compose.yml" up -d
        else
          echo "[scemas] error: no postgres available" >&2
          exit 1
        fi
      '';
      scemas-db-stop = pkgs.writeShellScriptBin "scemas-db-stop" ''
        pg_stop 2>/dev/null
        if command -v docker >/dev/null 2>&1; then
          ${findRoot}
          docker compose -f "$SCEMAS_ROOT/docker-compose.yml" down 2>/dev/null
        fi
      '';
      scemas-engine = pkgs.writeShellScriptBin "scemas-engine" ''
        ${findRoot}
        cd "$SCEMAS_ROOT"
        if command -v watchexec >/dev/null 2>&1; then
          exec watchexec \
            --restart \
            --watch crates \
            --watch data \
            --watch Cargo.toml \
            --watch Cargo.lock \
            --exts rs,toml,json,lock \
            -- cargo run -p scemas-server
        fi
        exec cargo run -p scemas-server
      '';
      scemas-dash = pkgs.writeShellScriptBin "scemas-dash" ''
        ${findRoot}
        cd "$SCEMAS_ROOT" && exec bun --filter @scemas/dashboard dev
      '';
      scemas-dev = pkgs.writeShellScriptBin "scemas-dev" ''
        ${findRoot}
        ${firstTimeSetup}
        scemas-db
        echo "[scemas] waiting for postgres..."
        sleep 2
        (cd "$SCEMAS_ROOT" && bun db:push)
        echo "[scemas] starting rust engine + dashboard"
        echo "[scemas] engine on :3001, dashboard on :3000 (ctrl+c to stop all)"

        cleanup() {
          echo ""
          echo "[scemas] shutting down..."
          kill $ENGINE_PID $DASH_PID 2>/dev/null
          wait $ENGINE_PID $DASH_PID 2>/dev/null
          echo "[scemas] stopped"
        }
        trap cleanup INT TERM

        cd "$SCEMAS_ROOT"
        if command -v watchexec >/dev/null 2>&1; then
          watchexec \
            --restart \
            --watch crates \
            --watch data \
            --watch Cargo.toml \
            --watch Cargo.lock \
            --exts rs,toml,json,lock \
            -- cargo run -p scemas-server &
        else
          cargo run -p scemas-server &
        fi
        ENGINE_PID=$!
        bun --filter @scemas/dashboard dev &
        DASH_PID=$!

        wait $ENGINE_PID $DASH_PID
      '';
      scemas-seed = pkgs.writeShellScriptBin "scemas-seed" ''
        ${findRoot}
        cd "$SCEMAS_ROOT" && exec bun run scripts/seed.ts "$@"
      '';
      scemas-check = pkgs.writeShellScriptBin "scemas-check" ''
        ${findRoot}
        echo "[scemas] cargo fmt"
        (cd "$SCEMAS_ROOT" && cargo fmt)
        echo "[scemas] cargo clippy"
        (cd "$SCEMAS_ROOT" && cargo clippy --all --benches --tests --examples --all-features)
        echo "[scemas] typecheck"
        (cd "$SCEMAS_ROOT" && bun run typecheck)
      '';
      scemas-nuke = pkgs.writeShellScriptBin "scemas-nuke" ''
        echo "[scemas] stopping everything"
        scemas-db-stop
        pkill -f "scemas-server" 2>/dev/null
        pkill -f "next-server" 2>/dev/null
        echo "[scemas] done"
      '';
    in {
      default = pkgs.mkShell {
        buildInputs = with pkgs; [
          cargo clippy rustc rustfmt rust-analyzer
          watchexec
          bun nodejs_22
          postgresql_16 pg_init pg_start pg_stop
          pkg-config openssl python3
          scemas-db scemas-db-stop scemas-engine scemas-dash
          scemas-dev scemas-seed scemas-check scemas-nuke
        ];
        env = {
          RUST_SRC_PATH = "${pkgs.rustPlatform.rustLibSrc}";
          PGPORT = "5432";
          PGHOST = "localhost";
          DATABASE_URL = "postgres://scemas:scemas@localhost:5432/scemas";
        };
        shellHook = ''
          export PGDATA="$PWD/.pgdata"
          echo "[scemas] ready. try: scemas-dev, scemas-check, scemas-seed"
        '';
      };
    });

    formatter = forAllSystems (pkgs: pkgs.alejandra);
  };
}

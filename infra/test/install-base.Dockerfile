# The install test's base image: a clean Ubuntu with the packages bootstrap.sh --test and the test
# itself install, already downloaded. Only the slow part (apt + the PGDG repo) is cached: every run
# still does bootstrap.sh --test's whole configuration (PgBouncer, conf.d, kit-db, roles) from
# scratch, against packages that are already there (its apt-get install is then a no-op). The
# package's own `main` cluster stays, as on the VPS, where the package created it too.
# Built and tagged by install.test.sh (tag = hash of this file); rebuild with KIT_TEST_REBUILD=1.
FROM ubuntu:24.04
ARG PG=17
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq \
 && apt-get install -y -qq curl ca-certificates gnupg lsb-release openssl postgresql-common procps cron iproute2 >/dev/null \
 && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null \
 && apt-get install -y -qq "postgresql-$PG" pgbouncer >/dev/null

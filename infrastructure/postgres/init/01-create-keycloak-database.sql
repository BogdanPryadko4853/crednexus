\getenv keycloak_db_name POSTGRES_KEYCLOAK_DATABASE
\getenv keycloak_db_username POSTGRES_KEYCLOAK_USERNAME
\getenv keycloak_db_password POSTGRES_KEYCLOAK_PASSWORD

CREATE USER :"keycloak_db_username" WITH PASSWORD :'keycloak_db_password';
CREATE DATABASE :"keycloak_db_name" OWNER :"keycloak_db_username";

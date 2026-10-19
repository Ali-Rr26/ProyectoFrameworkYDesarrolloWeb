package config

import (
	"testing"
	"time"
)

// setRequired define las variables obligatorias y vacía las opcionales para que
// Load use sus valores por defecto (t.Setenv las restaura al terminar la prueba).
func setRequired(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://u:p@localhost:5432/db")
	t.Setenv("JWT_SECRET", "un-secreto-de-prueba-de-al-menos-32-caracteres")
	for _, key := range []string{"PORT", "JWT_TTL", "APP_ENV", "APP_TIMEZONE", "CHECKOUT_FAIL_AT", "CHECKOUT_COMMIT_DELAY"} {
		t.Setenv(key, "")
	}
}

func TestLoadDefaults(t *testing.T) {
	setRequired(t)

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "4000" {
		t.Errorf("Port=%q; se esperaba 4000", cfg.Port)
	}
	if cfg.JWTTTL != 2*time.Hour {
		t.Errorf("JWTTTL=%s; se esperaba 2h", cfg.JWTTTL)
	}
	if cfg.AppEnv != EnvProduction || cfg.IsDev() {
		t.Errorf("AppEnv=%q; sin APP_ENV debe ser production (detalles ocultos)", cfg.AppEnv)
	}
	if cfg.Location == nil || cfg.Location.String() != DefaultTimezone {
		t.Errorf("Location=%v; se esperaba %s", cfg.Location, DefaultTimezone)
	}
}

func TestLoadRejectsInvalidTimezone(t *testing.T) {
	setRequired(t)
	t.Setenv("APP_TIMEZONE", "Marte/Olympus")
	if _, err := Load(); err == nil {
		t.Fatal("con una zona horaria inexistente Load debe fallar")
	}
}

func TestLoadDevEnvironment(t *testing.T) {
	setRequired(t)
	t.Setenv("APP_ENV", EnvDev)

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.IsDev() {
		t.Error("con APP_ENV=dev IsDev() debe ser true")
	}
}

func TestLoadRequiresSecrets(t *testing.T) {
	for _, missing := range []string{"DATABASE_URL", "JWT_SECRET"} {
		t.Run(missing, func(t *testing.T) {
			setRequired(t)
			t.Setenv(missing, "")
			if _, err := Load(); err == nil {
				t.Fatalf("sin %s Load debe fallar", missing)
			}
		})
	}
}

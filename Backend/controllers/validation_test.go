package controllers

import (
	"strings"
	"testing"
)

func TestValidEmail(t *testing.T) {
	valid := []string{"ana@correo.com", "ana.garcia+tienda@multicatalogo.ec", "a@b.co"}
	invalid := []string{
		"", "ana", "ana@", "@correo.com", "ana@localhost", "ana@.com", "ana@correo.",
		"Ana <ana@correo.com>", "<ana@correo.com>", "ana @correo.com",
		strings.Repeat("a", 250) + "@x.com",
	}
	for _, e := range valid {
		if !validEmail(e) {
			t.Errorf("validEmail(%q) = false; se esperaba true", e)
		}
	}
	for _, e := range invalid {
		if validEmail(e) {
			t.Errorf("validEmail(%q) = true; se esperaba false", e)
		}
	}
}

func TestPasswordProblems(t *testing.T) {
	cases := []struct {
		password string
		missing  []string
	}{
		{"Segura#2026", nil},
		{"Ñandú$2026", nil},
		{"123456", []string{"mínimo 8 caracteres", "una mayúscula", "una minúscula", "un carácter especial"}},
		{"abcdefgh", []string{"una mayúscula", "un número", "un carácter especial"}},
		{"ABCDEFG1!", []string{"una minúscula"}},
		{"Abcdefg1", []string{"un carácter especial"}},
		{"Abcdefg!", []string{"un número"}},
		{"Aa1!" + strings.Repeat("x", 70), []string{"máximo 72 bytes"}},
	}
	for _, tc := range cases {
		got := passwordProblems(tc.password)
		if strings.Join(got, "|") != strings.Join(tc.missing, "|") {
			t.Errorf("passwordProblems(%q) = %v; se esperaba %v", tc.password, got, tc.missing)
		}
	}
}

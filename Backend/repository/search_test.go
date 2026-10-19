package repository

import "testing"

func TestContainsPattern(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", ""},
		{"ana", "%ana%"},
		{"50%", `%50\%%`},
		{"user_1", `%user\_1%`},
		{`a\b`, `%a\\b%`},
	}
	for _, tc := range cases {
		if got := containsPattern(tc.in); got != tc.want {
			t.Errorf("containsPattern(%q) = %q, se esperaba %q", tc.in, got, tc.want)
		}
	}
}

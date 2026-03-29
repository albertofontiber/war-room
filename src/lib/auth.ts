import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const users = [
          {
            id: "1",
            name: process.env.ADMIN_USER_1 ?? "alberto",
            password: process.env.ADMIN_PASS_1 ?? "",
          },
          {
            id: "2",
            name: process.env.ADMIN_USER_2 ?? "gabriel",
            password: process.env.ADMIN_PASS_2 ?? "",
          },
        ];

        const user = users.find(
          (u) =>
            u.name === credentials.username &&
            u.password === credentials.password
        );

        if (!user) return null;
        return { id: user.id, name: user.name, email: `${user.name}@fontiber.com` };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.name = user.name;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.name = token.name as string;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

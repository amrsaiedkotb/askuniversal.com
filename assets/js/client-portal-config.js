const PORTAL_CONFIG = {
  projectId: "mcddmxvznxubwjkrgxad",
  clientLoginDomain: "clients.askuniversal.com",
  supabase: {
    url: "https://mcddmxvznxubwjkrgxad.supabase.co",
    publishableKey: "sb_publishable_VhEFH5wtML5WdNwH6AvVJA_-Z0o5LKN",
    functionsPath: "portal-api",
  },
  collections: {
    users: "accounts",
    workUpdates: "work_updates",
    documents: "documents",
    legalDocuments: "legal_documents",
    contactMessages: "contact_messages",
  },
  storagePaths: {
    clientDocuments: "client-documents",
    legalLibrary: "public-legal-docs",
  },
};

window.PORTAL_CONFIG = PORTAL_CONFIG;

export { PORTAL_CONFIG };

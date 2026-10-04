/**
 * Guide d'utilisation de l'application, consulté par l'assistant. Chaque
 * fiche décrit les étapes avec les noms exacts des menus et des boutons.
 */

export interface HelpTopic {
  id: string;
  title: string;
  /** Expressions qui désignent ce sujet (voir `hasPhrase`). */
  keywords: readonly string[];
  steps: readonly string[];
  /** Remarque affichée après les étapes. */
  note?: string;
  link?: { label: string; href: string };
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: "avatar",
    title: "Mettre votre photo de profil",
    keywords: ["photo de profil", "photo profil", "avatar", "ma photo", "mon visage", "photo de moi"],
    steps: [
      "Ouvrez le menu, puis « Personnalisation ».",
      "Dans la carte « Photo de profil », appuyez sur « Ajouter » (ou « Changer »).",
      "Prenez une photo ou choisissez-en une : elle est réduite puis enregistrée.",
    ],
    note: "Votre photo s'affiche dans le menu, à côté de votre nom. Pour l'enlever : « Retirer ».",
    link: { label: "Ouvrir Personnalisation", href: "/parametres" },
  },
  {
    id: "logo",
    title: "Mettre le logo de l'atelier",
    keywords: ["logo", "marque", "embleme"],
    steps: [
      "Ouvrez le menu, puis « Personnalisation ».",
      "Dans la carte « Logo », appuyez sur « Ajouter ». Une image carrée rend le mieux.",
    ],
    note: "Le logo remplace l'icône en haut du menu et apparaît sur les reçus. Seul le propriétaire peut le changer.",
    link: { label: "Ouvrir Personnalisation", href: "/parametres" },
  },
  {
    id: "cover",
    title: "Mettre une photo de couverture",
    keywords: ["couverture", "photo de fond", "fond du menu", "arriere plan", "image de fond"],
    steps: [
      "Ouvrez le menu, puis « Personnalisation ».",
      "Dans la carte « Photo de couverture », appuyez sur « Ajouter ».",
    ],
    note: "Elle s'affiche en fond du menu, légèrement floutée. Une photo de l'atelier ou de vos créations fait très bien l'affaire.",
    link: { label: "Ouvrir Personnalisation", href: "/parametres" },
  },
  {
    id: "client-new",
    title: "Ajouter un client",
    keywords: ["ajouter un client", "nouveau client", "creer un client", "enregistrer un client", "ajouter une cliente", "nouvelle cliente", "inscrire un client"],
    steps: [
      "Ouvrez « Clients », puis appuyez sur « Nouveau client ».",
      "Saisissez le nom complet, le téléphone et, si possible, le numéro WhatsApp.",
      "Enregistrez : la fiche est créée, même sans connexion.",
    ],
    link: { label: "Ouvrir Clients", href: "/clients" },
  },
  {
    id: "measurements",
    title: "Enregistrer les mesures (mensurations)",
    keywords: ["mesure", "mensuration", "tour de taille", "tour de poitrine", "tour de hanche", "longueur", "prendre les mesures", "carrure", "encolure", "taille du client"],
    steps: [
      "Ouvrez « Clients » et appuyez sur la fiche du client.",
      "Dans la partie « Mesures », appuyez sur « Créer un profil » et donnez-lui un nom (ex. « Boubou », « Pantalon », « Robe »).",
      "Ajoutez chaque mesure : son nom (« Tour de taille »…) et la valeur en centimètres.",
      "Appuyez sur « Enregistrer les mesures ».",
    ],
    note: "Un client peut avoir plusieurs profils de mesures. Les anciennes valeurs restent dans l'historique.",
    link: { label: "Ouvrir Clients", href: "/clients" },
  },
  {
    id: "order-new",
    title: "Créer une commande",
    keywords: ["nouvelle commande", "creer une commande", "ajouter une commande", "enregistrer une commande", "prendre une commande", "faire une commande"],
    steps: [
      "Ouvrez « Commandes », puis « Nouvelle commande ».",
      "Choisissez le client (créez-le d'abord s'il n'existe pas).",
      "Ajoutez les articles : type, quantité et prix. Le total se calcule seul.",
      "Indiquez la livraison prévue et la priorité, puis enregistrez.",
    ],
    note: "La commande reçoit un numéro ORD-… et apparaît dans la colonne « Enregistrée ». Avec une date de livraison, le rendez-vous est noté tout seul dans le calendrier (heure modifiable dans le formulaire).",
    link: { label: "Ouvrir Commandes", href: "/commandes" },
  },
  {
    id: "order-progress",
    title: "Faire avancer une commande (étapes)",
    keywords: ["avancer", "etape", "changer le statut", "statut", "deplacer une commande", "colonne", "passer a l etape", "marquer comme", "livree", "terminee"],
    steps: [
      "Ouvrez « Commandes » en vue « Atelier » : une colonne par étape (Enregistrée, Tissu reçu, Couture, Essayage…).",
      "Sur ordinateur, faites glisser la carte vers la colonne suivante.",
      "Sur téléphone, appuyez sur le bouton de l'étape suivante en bas de la carte.",
    ],
    note: "Vous pouvez aussi ouvrir la commande et utiliser « Faire avancer l'atelier ». Chaque changement est gardé dans l'historique.",
    link: { label: "Ouvrir Commandes", href: "/commandes" },
  },
  {
    id: "order-assign",
    title: "Confier une commande à un membre de l'équipe",
    keywords: ["affecter", "assigner", "attribuer", "confier", "qui s occupe", "responsable de la commande"],
    steps: ["Ouvrez la commande dans « Commandes ».", "Dans « Personne affectée », choisissez le membre de l'équipe."],
    note: "Le filtre « personne » de la page Commandes montre ensuite le travail de chacun.",
    link: { label: "Ouvrir Commandes", href: "/commandes" },
  },
  {
    id: "order-cancel",
    title: "Annuler une commande",
    keywords: ["annuler une commande", "annuler la commande", "supprimer une commande", "effacer une commande"],
    steps: ["Ouvrez la commande dans « Commandes ».", "Appuyez sur « Annuler » et indiquez la raison (obligatoire)."],
    note: "Une commande n'est jamais effacée : elle passe en « Annulée » et reste dans l'historique.",
    link: { label: "Ouvrir Commandes", href: "/commandes" },
  },
  {
    id: "payment",
    title: "Enregistrer un paiement (acompte, avance, solde)",
    keywords: ["paiement", "encaisser", "acompte", "avance", "payer", "versement", "wave", "orange money", "moov", "le client a paye", "argent recu"],
    steps: [
      "Ouvrez la commande dans « Commandes ».",
      "Dans « Paiements », appuyez sur « Encaisser ».",
      "Saisissez le montant et le mode (espèces, Wave, Orange Money…), puis « Confirmer ».",
    ],
    note: "Le reste à payer se met à jour tout seul. Un montant trop élevé est signalé comme surplus.",
    link: { label: "Ouvrir Commandes", href: "/commandes" },
  },
  {
    id: "receipt",
    title: "Faire un reçu (imprimer, PDF, WhatsApp)",
    keywords: ["recu", "facture", "imprimer", "pdf", "ticket de caisse", "justificatif", "bon de paiement"],
    steps: [
      "Ouvrez la commande, partie « Paiements ».",
      "À côté du paiement, appuyez sur « Reçu » : il reçoit un numéro REC-….",
      "Dans le reçu : « Imprimer », « Télécharger le PDF » ou « WhatsApp » pour l'envoyer au client.",
    ],
    note: "Les reçus déjà faits sont dans « Reçus émis » (bouton « Voir »). Un reçu ne peut plus être modifié.",
    link: { label: "Ouvrir Commandes", href: "/commandes" },
  },
  {
    id: "receipt-details",
    title: "Changer l'adresse ou le téléphone affichés sur les reçus",
    keywords: ["coordonnees", "adresse sur le recu", "telephone sur le recu", "en tete", "pied de page", "nom sur le recu"],
    steps: ["Ouvrez n'importe quel reçu.", "Appuyez sur « Coordonnées de l'atelier », modifiez puis « Enregistrer »."],
    note: "Réservé au propriétaire. Les nouveaux reçus utilisent les nouvelles coordonnées.",
    link: { label: "Ouvrir Commandes", href: "/commandes" },
  },
  {
    id: "payment-cancel",
    title: "Annuler un paiement saisi par erreur",
    keywords: ["annuler un paiement", "annuler le paiement", "rembourser", "remboursement", "erreur de paiement", "contre avoir", "mauvais montant"],
    steps: [
      "Ouvrez la commande, partie « Paiements ».",
      "Appuyez sur « Annuler » à côté du paiement et indiquez la raison.",
      "Si un reçu avait été fait, appuyez sur « Contre-avoir » pour l'annuler proprement.",
    ],
    note: "Le paiement reste visible, barré, pour garder une trace. Seuls le propriétaire et le gérant peuvent annuler.",
    link: { label: "Ouvrir Commandes", href: "/commandes" },
  },
  {
    id: "photos",
    title: "Ajouter une photo (tissu, client, commande)",
    keywords: ["photo", "image", "capture", "photo de la commande", "photo du tissu"],
    steps: [
      "Ouvrez la fiche concernée : une commande, un client ou un tissu.",
      "Dans « Photos », appuyez sur « Ajouter », puis « Prendre ou choisir une photo ».",
    ],
    note: "Pour le modèle à coudre d'une commande, mettez sa photo sur la commande : toute l'équipe la voit. Jusqu'à 12 photos par fiche.",
    link: { label: "Ouvrir Commandes", href: "/commandes" },
  },
  {
    id: "models",
    title: "Ranger vos modèles (galerie « Mes modèles »)",
    keywords: ["modele", "mes modeles", "galerie", "catalogue", "mes creations", "montrer au client", "ajouter un modele", "mettre un modele", "photo du modele"],
    steps: [
      "Ouvrez « Mes modèles », puis « Nouveau modèle » : nom, catégorie (grand boubou, robe…), prix indicatif, description.",
      "Appuyez sur « Créer et ajouter des photos », puis « Ajouter » pour prendre ou choisir les photos.",
      "Pour montrer un modèle à un client : ouvrez-le, puis « Envoyer au client » (WhatsApp ou autre application du téléphone).",
    ],
    note: "Les photos restent privées à votre atelier. Filtrez par catégorie ou cherchez par nom.",
    link: { label: "Ouvrir Mes modèles", href: "/modeles" },
  },
  {
    id: "appointment",
    title: "Prendre un rendez-vous et envoyer un rappel",
    keywords: ["rendez vous", "rdv", "essayage", "rappel", "programmer", "planifier"],
    steps: [
      "Ouvrez « Rendez-vous », puis « Nouveau rendez-vous ».",
      "Choisissez le client, le type (essayage, mesures, retrait…) et l'horaire.",
      "La veille ou le jour même, le rendez-vous apparaît dans « Rappels à envoyer » : appuyez sur « Préparer le rappel » pour ouvrir WhatsApp avec le message prêt.",
    ],
    link: { label: "Ouvrir Rendez-vous", href: "/rdv" },
  },
  {
    id: "team-invite",
    title: "Ajouter un employé ou un apprenti",
    keywords: ["inviter", "employe", "apprenti", "ajouter un membre", "collaborateur", "ajouter quelqu un", "nouvel employe", "equipe"],
    steps: [
      "Ouvrez « Équipe », puis « Inviter un membre ».",
      "Choisissez son rôle (gérant, employé, apprenti).",
      "Envoyez-lui le lien par WhatsApp ou par e-mail : il crée son compte avec ce lien.",
    ],
    note: "Le lien ne sert qu'une fois et expire au bout de 7 jours.",
    link: { label: "Ouvrir Équipe", href: "/equipe" },
  },
  {
    id: "team-remove",
    title: "Désactiver ou retirer un membre de l'équipe",
    keywords: ["retirer un membre", "supprimer un employe", "desactiver", "enlever un employe", "renvoyer", "licencier", "retirer quelqu un"],
    steps: ["Ouvrez « Équipe ».", "Sur la ligne de la personne : « Désactiver » (temporaire) ou « Retirer » (définitif, après confirmation)."],
    note: "Réservé au propriétaire. Le travail déjà fait par la personne reste enregistré.",
    link: { label: "Ouvrir Équipe", href: "/equipe" },
  },
  {
    id: "stock",
    title: "Gérer le stock de tissus",
    keywords: ["tissu", "stock", "nouveau tissu", "entree de stock", "sortie de stock", "metre de tissu", "inventaire", "rouleau"],
    steps: [
      "Ouvrez « Stock », puis « Nouveau tissu » : nom, couleur, fournisseur, stock initial en mètres.",
      "Pour une arrivée ou une utilisation, appuyez sur « Entrée » ou « Sortie » sur la ligne du tissu, puis « Enregistrer le mouvement ».",
    ],
    note: "Les tissus à 1 mètre ou moins sont signalés « Stock bas ».",
    link: { label: "Ouvrir Stock", href: "/stock" },
  },
  {
    id: "subscription",
    title: "Changer d'abonnement (payer le plan)",
    keywords: ["abonnement", "plan", "pro!", "premium", "forfait", "passer a", "preuve de paiement", "payer l application", "payer l abonnement", "prolonger", "essai gratuit"],
    steps: [
      "Ouvrez « Abonnement », puis « Passer à ce plan » sur la formule voulue.",
      "Choisissez le pays d'où vous payez : les numéros de transfert s'affichent.",
      "Faites le transfert, puis envoyez la capture comme preuve.",
      "Dès que le paiement est vérifié, la formule est activée.",
    ],
    link: { label: "Ouvrir Abonnement", href: "/abonnement" },
  },
  {
    id: "currency",
    title: "Changer le pays ou la monnaie",
    keywords: ["monnaie", "devise", "pays", "franc", "gnf", "euro", "dirham", "naira", "cedi"],
    steps: ["Ouvrez « Personnalisation », carte « Pays et monnaie ».", "Choisissez le pays et la monnaie, puis enregistrez."],
    note: "La monnaie se bloque dès la première commande, pour que les montants restent justes. Réservé au propriétaire.",
    link: { label: "Ouvrir Personnalisation", href: "/parametres" },
  },
  {
    id: "offline",
    title: "Travailler sans Internet",
    keywords: ["hors ligne", "sans internet", "pas de connexion", "pas de reseau", "connexion", "synchronis", "reseau", "internet"],
    steps: [
      "Continuez à travailler normalement : clients, commandes, paiements et rendez-vous sont enregistrés sur l'appareil.",
      "Au retour du réseau, tout est envoyé automatiquement, sans doublon.",
    ],
    note: "La pastille en bas du menu indique l'état de la synchronisation. Les photos et l'abonnement demandent une connexion.",
  },
  {
    id: "install",
    title: "Installer l'application sur le téléphone",
    keywords: ["installer", "ecran d accueil", "telecharger l application", "icone", "raccourci", "application mobile", "play store"],
    steps: [
      "Ouvrez le site dans Chrome (Android) ou Safari (iPhone).",
      "Android : menu ⋮ puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».",
      "iPhone : bouton Partager puis « Sur l'écran d'accueil ».",
    ],
    note: "L'application s'ouvre ensuite comme les autres, même sans réseau.",
  },
  {
    id: "password",
    title: "Mot de passe oublié",
    keywords: ["mot de passe", "oublie", "reinitialiser", "changer le mot de passe", "connecter", "connexion impossible"],
    steps: [
      "Sur la page de connexion, appuyez sur « Mot de passe oublié ? ».",
      "Saisissez votre e-mail : vous recevez un lien pour choisir un nouveau mot de passe.",
    ],
    note: "Pensez à regarder dans les spams si l'e-mail n'arrive pas.",
  },
  {
    id: "report",
    title: "Voir le rapport du mois et l'exporter pour Excel",
    keywords: ["rapport", "excel", "export", "comptable", "bilan", "statistique", "chiffres du mois"],
    steps: ["Ouvrez « Rapports » et choisissez le mois.", "Appuyez sur « Exporter pour Excel » : le fichier s'ouvre dans Excel ou Google Sheets."],
    link: { label: "Ouvrir Rapports", href: "/rapports" },
  },
  {
    id: "client-archive",
    title: "Archiver (retirer) un client",
    keywords: ["archiver", "supprimer un client", "effacer un client", "retirer un client"],
    steps: ["Ouvrez la fiche du client dans « Clients ».", "Appuyez sur « Archiver »."],
    note: "Le client disparaît de la liste mais son historique (commandes, paiements) est conservé.",
    link: { label: "Ouvrir Clients", href: "/clients" },
  },
  {
    id: "whatsapp",
    title: "Envoyer un message WhatsApp au client",
    keywords: ["whatsapp", "message", "prevenir le client", "envoyer au client", "sms"],
    steps: [
      "Les messages sont préparés par l'application : rappel de rendez-vous (« Rendez-vous »), reçu (« WhatsApp » dans le reçu).",
      "WhatsApp s'ouvre avec le texte : relisez-le et appuyez sur Envoyer.",
    ],
    note: "Enregistrez le numéro WhatsApp du client avec l'indicatif (+221…) pour ouvrir directement sa conversation.",
  },
  {
    id: "search",
    title: "Retrouver un client ou une commande",
    keywords: ["rechercher", "chercher", "trouver", "retrouver"],
    steps: ["Sur le « Tableau de bord », tapez dans la barre de recherche : nom, téléphone, numéro ORD-…", "Vous pouvez aussi me demander : « commandes de Awa »."],
    link: { label: "Ouvrir le tableau de bord", href: "/dashboard" },
  },
];

export function helpTopic(id: string): HelpTopic | undefined {
  return HELP_TOPICS.find((t) => t.id === id);
}

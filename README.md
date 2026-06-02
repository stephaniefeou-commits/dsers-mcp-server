# DSers MCP Server

Serveur MCP pour connecter Claude à DSers dropshipping. Permet de gérer les produits, mapper les fournisseurs et gérer les commandes directement depuis Claude.

## Outils disponibles

| Outil | Description |
|-------|-------------|
| `dsers_get_stores` | Liste les boutiques Shopify connectées |
| `dsers_search_products` | Recherche les produits DSers |
| `dsers_get_product` | Détails d'un produit |
| `dsers_map_supplier` | Mappe un fournisseur à un produit |
| `dsers_import_product` | Importe un produit AliExpress/CJ |
| `dsers_list_orders` | Liste les commandes |
| `dsers_place_order` | Envoie une commande au fournisseur |

## Déploiement sur Render

### 1. Pusher sur GitHub
```bash
git init
git add .
git commit -m "DSers MCP Server"
git remote add origin https://github.com/TON_USER/dsers-mcp-server.git
git push -u origin main
```

### 2. Déployer sur Render
1. Va sur [render.com](https://render.com) → New → Web Service
2. Connecte ton repo GitHub
3. Render détecte automatiquement le `render.yaml`
4. Clique **Deploy**
5. Note l'URL publique (ex: `https://dsers-mcp-server.onrender.com`)

### 3. Ajouter dans Claude.ai
1. Claude.ai → Settings → Connectors → Add custom connector
2. URL : `https://dsers-mcp-server.onrender.com/mcp`
3. Save

## Utilisation

Chaque outil nécessite ta clé API DSers :
- Va sur DSers → Settings → API → Generate API Key
- Utilise cette clé dans chaque appel d'outil

## Santé du serveur

```
GET /health
```

"""
Équipe Gercie - Version PRO (3 agents + modification sécurisée des gros fichiers)
IGNORE les dossiers node_modules, .next, .git, etc.

Utilisation :
    python equipe_gercie.py                       -> l'architecte choisit la prochaine tâche
    python equipe_gercie.py "Ajouter un bouton X" -> tu imposes la tâche

Prérequis :
    pip install crewai crewai-tools
    Variable d'environnement GEMINI_API_KEY définie.
"""

import os
import sys
from crewai import Agent, Task, Crew, Process, LLM
from crewai_tools import FileReadTool
from crewai.tools import tool

# ==========================================
# 0. CONFIGURATION
# ==========================================
PROJECT_DIR = os.getenv("PROJECT_DIR", os.getcwd())
os.chdir(PROJECT_DIR)

TACHE_IMPOSEE = " ".join(sys.argv[1:]).strip()

MAX_ITER = 5
MAX_RPM = 10

# ==========================================
# 1. OUTILS PERSONNALISÉS (SÉCURISÉS)
# ==========================================

@tool("Apply Patch to File")
def apply_patch_tool(file_path: str, search_block: str, replace_block: str) -> str:
    """
    Modifie un fichier en remplaçant un bloc de texte exact (search_block) par un autre (replace_block).
    Si le fichier n'existe pas, il le crée avec le contenu de replace_block.
    """
    try:
        # Créer le dossier parent s'il n'existe pas (ex: components/ui/)
        directory = os.path.dirname(file_path)
        if directory:
            os.makedirs(directory, exist_ok=True)

        file_exists = os.path.exists(file_path)

        # SÉCURITÉ 1 : Le fichier n'existe pas (Création)
        if not file_exists:
            if search_block != "":
                return f"ERREUR : Le fichier {file_path} n'existe pas encore. Pour le créer, le search_block DOIT être vide ('')."
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(replace_block)
            return f"SUCCÈS : Le fichier {file_path} a été créé."

        # SÉCURITÉ 2 : Le fichier existe déjà (Modification)
        else:
            if search_block == "":
                return f"ERREUR : Le fichier {file_path} existe DÉJÀ. Vous ne pouvez pas utiliser un search_block vide pour écraser un fichier existant. Vous devez fournir le texte exact à remplacer."
            
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            if search_block not in content:
                return f"ERREUR : Le texte à chercher (search_block) n'a pas été trouvé dans {file_path}. Vérifie l'exactitude du texte (espaces, retours à la ligne)."

            # Remplace la première occurrence trouvée
            new_content = content.replace(search_block, replace_block, 1)

            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)

            return f"SUCCÈS : Le fichier {file_path} a été mis à jour chirurgicalement."
            
    except Exception as e:
        return f"ERREUR lors de la modification de {file_path} : {str(e)}"

@tool("List Project Files")
def list_project_files_tool(directory: str = ".") -> str:
    """
    Liste les fichiers du projet en ignorant automatiquement les dossiers lourds et inutiles.
    """
    ignored_dirs = {'node_modules', '.next', '.git', 'dist', 'build', 'coverage', '.vercel', '.husky'}
    ignored_files = {'package-lock.json', 'tsconfig.tsbuildinfo', 'errors.html', 'errors.json', 'errors.txt'}
    valid_files = []
    
    try:
        for root, dirs, files in os.walk(directory):
            dirs[:] = [d for d in dirs if d not in ignored_dirs and not d.startswith('.')]
            for file in files:
                if file not in ignored_files and not file.endswith(('.log', '.lock')):
                    rel_path = os.path.relpath(os.path.join(root, file), directory)
                    valid_files.append(rel_path)
                    
        result = "Fichiers du projet :\n" + "\n".join(valid_files[:300])
        if len(valid_files) > 300:
            result += f"\n... et {len(valid_files) - 300} autres fichiers."
        return result
    except Exception as e:
        return f"Erreur lors de la lecture du répertoire : {str(e)}"

# ==========================================
# 2. LE CERVEAU & OUTILS DE LECTURE
# ==========================================
llm = LLM(
    model=os.getenv("GEMINI_MODEL", "gemini/gemini-3.5-flash"),
    temperature=0.2,
)

read_tool = FileReadTool()

# ==========================================
# 3. DÉFINITION DES 3 AGENTS
# ==========================================

agent_architecte = Agent(
    role="Architecte Logiciel & Chef de Projet",
    goal=(
        "Lire PLAN.md, choisir UNE seule petite tâche et la transformer en "
        "instructions courtes, précises et sans ambiguïté pour le développeur."
    ),
    backstory=(
        "Tu es un architecte très expérimenté. Tu ne choisis jamais une tâche déjà "
        "terminée. Tu listes uniquement les fichiers réellement nécessaires."
    ),
    tools=[read_tool, list_project_files_tool], 
    llm=llm,
    verbose=True,
    allow_delegation=False,
    max_iter=MAX_ITER,
    max_rpm=MAX_RPM,
)

agent_codeur = Agent(
    role="Développeur Fullstack Senior (Next.js / React / TypeScript)",
    goal=(
        "Écrire du code propre en utilisant l'outil 'Apply Patch to File' pour modifier "
        "les fichiers existants sans jamais les réécrire entièrement."
    ),
    backstory=(
        "Tu es un expert absolu en Next.js, TypeScript, Tailwind et Supabase. "
        "Tu ne codes que ce qu'on te demande. Tu ne supprimes JAMAIS une fonctionnalité "
        "existante. IMPORTANT : Avant de modifier un fichier, tu DOIS le lire avec l'outil de lecture "
        "pour copier le texte exact (search_block). Tu ne réécris jamais tout le fichier."
    ),
    tools=[read_tool, apply_patch_tool],
    llm=llm,
    verbose=True,
    allow_delegation=False,
    max_iter=MAX_ITER,
    max_rpm=MAX_RPM,
)

agent_reviewer = Agent(
    role="Reviewer Senior : UI/UX, Sécurité et Qualité",
    goal=(
        "Relire le code produit et valider (ou rejeter) selon une checklist stricte : "
        "design, sécurité, absence de régression."
    ),
    backstory=(
        "Tu es à la fois designer pointilleux, hacker éthique et gardien de la stabilité. "
        "Tu relis les fichiers réellement modifiés sur le disque. Tu es concis : "
        "tu listes les problèmes, tu ne réécris pas le code."
    ),
    tools=[read_tool, list_project_files_tool],
    llm=llm,
    verbose=True,
    allow_delegation=False,
    max_iter=MAX_ITER,
    max_rpm=MAX_RPM,
)

# ==========================================
# 4. DÉFINITION DES TÂCHES
# ==========================================

if TACHE_IMPOSEE:
    desc_planif = f'La tâche imposée est : "{TACHE_IMPOSEE}". Décris les fichiers à modifier et comment les modifier (max 20 lignes).'
else:
    desc_planif = 'Lis "PLAN.md". Choisis UNE SEULE petite fonctionnalité. Décris les fichiers à modifier (max 20 lignes).'

tache_1_planification = Task(
    description=desc_planif,
    expected_output="Un cahier des charges technique court.",
    agent=agent_architecte,
)

tache_2_code = Task(
    description=(
        "En te basant sur les instructions de l'architecte :\n"
        "1. Lis le fichier existant (en entier) avec l'outil de lecture.\n"
        "2. Identifie le bloc exact de code à remplacer ou à ajouter (search_block).\n"
        "3. Utilise l'outil 'Apply Patch to File' avec les paramètres :\n"
        "   - file_path : le chemin du fichier.\n"
        "   - search_block : les quelques lignes existantes à remplacer (copiées EXACTEMENT depuis ta lecture).\n"
        "   - replace_block : le nouveau code qui remplacera le search_block.\n"
        "4. Si le fichier est NOUVEAU (n'existe pas), utilise un search_block vide ''.\n"
        "5. Ne renvoie pas le code complet dans ta réponse, donne juste un résumé des patches appliqués."
    ),
    expected_output="Une liste des modifications (patches) appliquées avec succès.",
    agent=agent_codeur,
    context=[tache_1_planification],
)

tache_3_review = Task(
    description=(
        "Relis les fichiers modifiés sur le disque. Applique cette checklist :\n"
        "DESIGN : Thème sombre, responsive, Tailwind.\n"
        "SÉCURITÉ : requireAdminApi(), RLS, pas de secrets.\n"
        "QUALITÉ : Aucune régression, imports propres.\n"
        "Donne ton verdict final."
    ),
    expected_output="Rapport de validation (VERDICT, Problèmes, Suggestions).",
    agent=agent_reviewer,
    context=[tache_1_planification, tache_2_code],
)

# ==========================================
# 5. CRÉATION DE L'ÉQUIPE ET LANCEMENT
# ==========================================

equipe_gercie = Crew(
    agents=[agent_architecte, agent_codeur, agent_reviewer],
    tasks=[tache_1_planification, tache_2_code, tache_3_review],
    process=Process.sequential,
    verbose=True,
    max_rpm=MAX_RPM,
)

if __name__ == "__main__":
    print("🚀 Démarrage de l'Équipe Gercie (Version PRO - Patches sécurisés)...")
    if TACHE_IMPOSEE:
        print(f"🎯 Tâche imposée : {TACHE_IMPOSEE}")

    resultat = equipe_gercie.kickoff()

    print("\n✅ Rapport final du Reviewer :")
    print(resultat)
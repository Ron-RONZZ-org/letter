import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def sample():
    return {
        "style": "fr-formal",
        "mode": "letter",
        "paper": "a4",
        "sender": {
            "name": "Rong Zhou",
            "title": "Directeur",
            "organization": "ronzz.ORG",
            "street": "1 rue de l'Exemple",
            "postal_code": "54000",
            "city": "Nancy",
            "region": "",
            "country": "France",
            "phone": "+33 6 00 00 00 00",
            "email": "ron@ronzz.org",
            "website": "https://ronzz.org",
        },
        "recipient": {
            "name": "Madame la Directrice",
            "title": "",
            "organization": "Université de Lorraine",
            "street": "2 rue du Campus",
            "postal_code": "54000",
            "city": "Nancy",
            "region": "",
            "country": "France",
            "phone": "",
            "email": "direction@example.fr",
            "website": "",
        },
        "place": "Nancy",
        "date": "25 novembre 2026",
        "subject": "Demande de rendez-vous",
        "reference": "",
        "your_ref": "2026-123",
        "our_ref": "",
        "salutation": "Madame la Directrice,",
        "body": "Je vous écris afin de solliciter **un rendez-vous**.\n\n- Premier point\n- Second point",
        "closing": "Veuillez agréer, Madame la Directrice, l'expression de mes salutations distinguées.",
        "enclosures": "Curriculum vitæ",
        "cc": "",
        "attach_pdf": True,
    }

from fastapi import APIRouter

router = APIRouter()


@router.get("/example")
def get_example():
    return {"message": "Hello from DiaHacks API"}

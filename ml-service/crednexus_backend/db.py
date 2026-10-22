from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


class Database:
    def __init__(self, url: str):
        self.engine = create_async_engine(
            url, pool_pre_ping=True, pool_size=5, max_overflow=5,
            connect_args={"command_timeout": 30, "server_settings": {"application_name": "crednexus"}},
            hide_parameters=True,
        )
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)

    async def close(self):
        await self.engine.dispose()

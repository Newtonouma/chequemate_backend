create table if not exists users (
   id                 serial primary key,
   email              varchar(255) unique not null,
   password           varchar(255) not null,
   username           varchar(255) unique not null,
   phone              varchar(20) not null,
   name               varchar(255) not null,
   chess_com_username varchar(255),
   lichess_username   varchar(255),
   preferred_platform varchar(50) not null,
   slogan             varchar(500) default 'Ready to Play!',
   balance            decimal(10,2) default 0.00,
   current_rating     integer default 1200,
   last_rating_update timestamp with time zone,
   created_at         timestamp with time zone default current_timestamp,
   updated_at         timestamp with time zone default current_timestamp
); 

-- Wallet transactions table
create table if not exists transactions (
   id           serial primary key,
   user_id      integer not null
      references users ( id )
         on delete cascade,
   type         varchar(10) not null check ( type in ( 'credit',
                                               'debit' ) ),
   amount       decimal(10,2) not null,
   description  varchar(255) not null,
   reference_id varchar(255),
   status       varchar(20) default 'completed' check ( status in ( 'pending',
                                                              'completed',
                                                              'failed' ) ),
   created_at   timestamp with time zone default current_timestamp
);

-- Payments table for handling deposits and withdrawals
create table if not exists payments (
   id                     serial primary key,
   user_id                integer not null
      references users ( id )
         on delete cascade,
   challenge_id           integer,
   phone_number           varchar(20) not null,
   amount                 decimal(10,2) not null,
   transaction_type       varchar(20) not null check ( transaction_type in ( 'deposit',
                                                                      'withdrawal',
                                                                      'refund' ) ),
   status                 varchar(20) not null default 'pending' check ( status in ( 'pending',
                                                                                'completed',
                                                                                'failed',
                                                                                'cancelled' ) ),
   request_id             varchar(255) unique not null,
   game_id                integer,
   payout_reason          varchar(255),
   transaction_reference  varchar(255),
   transaction_id         varchar(255),
   callback_data          jsonb,
   opponent_id            integer
      references users ( id )
         on delete set null,
   created_at             timestamp with time zone default current_timestamp,
   updated_at             timestamp with time zone default current_timestamp
);